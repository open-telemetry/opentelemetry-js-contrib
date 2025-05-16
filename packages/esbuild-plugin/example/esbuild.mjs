
import * as assert from 'assert';
import * as fs from 'fs';
import * as module from 'module';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

// XXX esbuild plugin for OTel, heavily influenced by https://github.com/DataDog/dd-trace-js/tree/master/packages/datadog-esbuild/
//     TODO: add DD copyright to top of file? e.g. similar to https://github.com/open-telemetry/opentelemetry-js/blob/main/experimental/packages/opentelemetry-instrumentation/hook.mjs

// XXX does this plugin need to be CommonJS so a CJS-using esbuild.js file can used it? Probably, yes.

const NAME = '@opentelemetry/esbuild-plugin'
const DEBUG = ['all', 'verbose', 'debug'].includes(process.env.OTEL_LOG_LEVEL.toLowerCase())
const debug = DEBUG
  ? (msg, ...args) => { console.debug(`${NAME} debug: ${msg}`, ...args); }
  : () => {};

// XXX doc this
function pkgInfoFromPath(abspath) {
  const normpath = path.sep !== '/'
    ? abspath.replaceAll(path.sep, '/')
    : abspath;
  const NM = 'node_modules/';
  let idx = normpath.lastIndexOf(NM);
  if (idx < 0) {
    return;
  }
  idx += NM.length;
  let endIdx = normpath.indexOf('/', idx);
  if (endIdx < 0) {
    return;
  }
  if (normpath[idx] === '@') {
    endIdx = normpath.indexOf('/', endIdx + 1);
    if (endIdx < 0) {
      return;
    }
  }

  assert.equal(path.sep.length, 1);
  return {
    name: normpath.slice(idx, endIdx),
    // XXX doc normalization
    fullModulePath: normpath.slice(idx),
    pjPath: path.join(abspath.slice(0, endIdx), 'package.json'),
  };
}

/**
 * How this works. Take `require('fastify')`, for example.
 *
 * - esbuild calls:
 *      onResolve({path: 'fastify', namespace: 'file' })`
 *   which the plugin resolves to:
 *      {path: 'fastify', namespace: 'otel', pluginData}`
 *   where `pluginData` includes the absolute path to load and the package
 *   version. Importantly the namespace is changed to 'otel'.
 *
 * - esbuild calls:
 *      onLoad({path: 'fastify', namespace: 'otel', pluginData})
 *   which the plugin resolves to a stub module that does:
 *    - `require('${absolute path to module}')`,
 *    - sends a diag chan message to a possibly waiting OTel SDK to optionally
 *      patch the loaded module exports,
 *    - re-exports the, possibly now patched, module
 *
 * - esbuild calls:
 *      onResolve({path: '/.../node_modules/fastify/fastify.js', namespace: 'otel' })`
 *   which the plugin resolves back to the 'file' namespace
 *
 * - esbuild's default file loading loads the "fastify.js" as usual
 *
 * Which module paths to stub depends on the patching data for each given OTel
 * Instrumentation. Node.js builtin modules, like `net`, need not be stubbed
 * because they will be marked external (i.e. not inlined) by esbuild with the
 * `platform: 'node'` config.
 */
const CHANNEL_NAME = 'otel:bundle:load';
function otelPlugin(instrs) {
  // XXX move 'intsr' to keyed option
  // XXX add debug bool option so can choose in esbuild.mjs file

  return {
    name: 'opentelemetry',
    setup(build) {
      // Skip out gracefully if Node.js is too old for this plugin.
      // - Want `module.isBuiltin`, added in node v18.6.0, v16.17.0.
      // - Want `diagch.subscribe` added in node v18.7.0, v16.17.0
      //   (to avoid https://github.com/nodejs/node/issues/42170).
      // Note: these constraints *could* be avoided with added code and deps if
      // really necessary.
      const [major, minor] = process.versions.node.split('.').map(Number);
      if (major < 16 || major === 16 && minor < 17 || major === 18 && minor < 7) {
        console.warn(`@opentelemetry/esbuild-plugin warn: this plugin requires at least Node.js v16.17.0, v18.7.0 to work; current version is ${process.version}`)
        return;
      }

      const externals = new Set(build.initialOptions.external || []);

      // From the given OTel Instrumentation instances, determine which
      // load paths (e.g. 'fastify', 'mongodb/lib/sessions.js') will possibly
      // need to be patched at runtime.
      const pathsToStub = new Set();
      for (let instr of instrs) {
        const defns = instr.getModuleDefinitions();
        for (let defn of defns) {
          if (typeof defn.patch === 'function') {
            pathsToStub.add(defn.name);
          }
          for (let fileDefn of defn.files) {
            pathsToStub.add(fileDefn.name);
          }
        }
      }
      debug('module paths to stub:', pathsToStub);

      build.onResolve({ filter: /.*/ }, async (args) => {
        if (externals.has(args.path)) {
          // If this esbuild is configured to leave a package external, then
          // no need to stub for it in the bundle.
          return;
        }
        if (module.isBuiltin(args.path)) {
          // Node.js builtin modules are left in the bundle as `require(...)`,
          // so no need for stubbing.
          return
        }

        if (args.namespace === 'file') {
          // console.log('XXX onResolve file:', args);

          // This resolves the absolute path of the module, which is used in the stub.
          // XXX Not sure if should prefer:
          //    require.resolve(args.path, {paths: [args.resolveDir]})
          // Dev Note: Most of the bundle-time perf hit from this plugin is
          // from this `build.resolve()`.
          const resolved = await build.resolve(args.path, {
            kind: args.kind,
            resolveDir: args.resolveDir
            // Implicit `namespace: ''` here avoids recursion.
          });
          if (resolved.errors.length > 0) {
            return { errors: resolved.errors };
          }

          // Get the package name and version.
          const pkgInfo = pkgInfoFromPath(resolved.path)
          if (!pkgInfo) {
            debug(`skip resolved path, could not determine pkgInfo: "${resolved.path}"`);
            return;
          }

          let matchPath;
          if (pathsToStub.has(args.path)) {
            // E.g. `require('fastify')` matches
            // `InstrumentationNodeModuleDefinition { name: 'fastify' }`
            // from `@opentelemetry/instrumentation-fastify`.
            matchPath = args.path;
          } else if (pkgInfo.fullModulePath !== args.path && pathsToStub.has(pkgInfo.fullModulePath)) {
            // E.g. `require('./multi-commander')` from `@redis/client/...` matches
            // `InstrumentationNodeModuleFile { name: '@redis/client/dist/lib/client/multi-command.js' }
            // from `@opentelemetry/instrumentation-fastify`.
            matchPath = pkgInfo.fullModulePath;
          } else {
            // This module is not one that given instrumentations care about.
            return;
          }

          // Get the package version from its package.json.
          let pkgVersion;
          try {
            const pjContent = await fs.promises.readFile(pkgInfo.pjPath);
            pkgVersion = JSON.parse(pjContent).version;
          } catch (err) {
            debug(`skip "${matchPath}": could not determine package version: ${err.message}`);
            return;
          }

          return {
            path: matchPath,
            namespace: 'otel',
            pluginData: {
              fullPath: resolved.path,
              pkgName: pkgInfo.name,
              pkgVersion,
            }
          };

        } else if (args.namespace === 'otel') {
          return {
            path: args.path,
            namespace: 'file',
            // We expect `args.path` to always be an absolute path (from
            // resolved.path above), so `resolveDir` isn't necessary.
          };
        }
      })

      build.onLoad({ filter: /.*/, namespace: 'otel' }, async (args) => {
        debug(`stub module "${args.path}"`);
        return {
          contents: `
            const diagch = require('diagnostics_channel');
            const ch = diagch.channel('${CHANNEL_NAME}');
            const mod = require('${args.pluginData.fullPath}');
            const message = {
              name: '${args.path}',
              version: '${args.pluginData.pkgVersion}',
              exports: mod,
            };
            ch.publish(message);
            module.exports = message.exports;
          `,
          loader: 'js',
        }
      })
    },
  }
}

await esbuild.build({
  entryPoints: ['app.js'],
  bundle: true,
  platform: 'node',
  target: ['node14'],
  outdir: 'build',
  plugins: [otelPlugin(
    // [ new FastifyInstrumentation(), new RedisInstrumentation(), ]
    getNodeAutoInstrumentations(),
  )],
});
