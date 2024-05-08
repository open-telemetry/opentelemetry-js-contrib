/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  ExtractedModule,
  OnLoadArgs,
  OpenTelemetryPluginParams,
} from './types';
import { Plugin, PluginBuild } from 'esbuild';
import {
  instrumentations,
  otelPackageToInstrumentationConfig,
} from './config/main';

import { builtinModules } from 'module';
import { dirname } from 'path';
import { readFile } from 'fs/promises';
import { satisfies } from 'semver';
import { wrapModule } from './common';

const NODE_MODULES = 'node_modules/';

const BUILT_INS = new Set(builtinModules.flatMap(b => [b, `node:${b}`]));

export function openTelemetryPlugin(
  pluginConfig?: OpenTelemetryPluginParams
): Plugin {
  return {
    name: 'open-telemetry',
    setup(build) {
      build.onResolve({ filter: /.*/ }, async args => {
        if (
          shouldIgnoreModule({
            namespace: args.namespace,
            path: args.path,
            importer: args.importer,
            externalModules: pluginConfig?.externalModules,
            pathPrefixesToIgnore: pluginConfig?.pathPrefixesToIgnore,
          })
        ) {
          return;
        }

        const { path, extractedModule } = extractPackageAndModulePath(
          args.path,
          args.resolveDir
        );

        // We'll rely on the OTel auto-instrumentation at runtime to patch builtin modules
        if (isBuiltIn(args.path, extractedModule)) return;

        // See if we have an instrumentation registered for this package
        const matchingInstrumentation = await getInstrumentation({
          extractedModule,
          path: args.path,
          resolveDir: args.resolveDir,
          build,
        });

        if (!matchingInstrumentation) return;

        return {
          path,
          pluginData: {
            extractedModule,
            shouldPatchPackage: true,
            instrumentation: { name: matchingInstrumentation.name },
          },
        };
      });

      build.onLoad(
        { filter: /.*/ },
        async ({ path, pluginData }: OnLoadArgs) => {
          // Ignore any packages that don't have an instrumentation registered for them
          if (!pluginData?.shouldPatchPackage) return;

          const contents = await readFile(path);

          const config =
            otelPackageToInstrumentationConfig[pluginData.instrumentation.name];

          const packageConfig =
            pluginConfig?.instrumentationConfig?.[
              config.oTelInstrumentationPackage
            ];

          return {
            contents: wrapModule(contents.toString(), {
              instrumentationName: pluginData.instrumentation.name,
              oTelInstrumentationClass: config.oTelInstrumentationClass,
              oTelInstrumentationPackage: config.oTelInstrumentationPackage,
              instrumentedFileName: `${pluginData.extractedModule.package}/${pluginData.extractedModule.path}`,
              oTelInstrumentationConstructorArgs:
                config.configGenerator(packageConfig),
            }),
            resolveDir: dirname(path),
          };
        }
      );
    },
  };
}

// @see https://github.com/nodejs/node/issues/47000
function dotFriendlyResolve(path: string, directory: string): string {
  if (path === '.') {
    path = './';
  } else if (path === '..') {
    path = '../';
  }
  return require.resolve(path, { paths: [directory] });
}

/**
 * For a given full path to a module,
 *   return the package name it belongs to and the local path to the module
 *   input: '/foo/node_modules/@co/stuff/foo/bar/baz.js'
 *   output: { package: '@co/stuff', path: 'foo/bar/baz.js' }
 */
function extractPackageAndModulePath(
  path: string,
  resolveDir: string
): { path: string; extractedModule: ExtractedModule } {
  const fullPath = dotFriendlyResolve(path, resolveDir);

  const nodeModulesIndex = fullPath.lastIndexOf(NODE_MODULES);
  if (nodeModulesIndex < 0) {
    return {
      path: fullPath,
      extractedModule: { package: null, path: null },
    };
  }

  const subPath = fullPath.substring(nodeModulesIndex + NODE_MODULES.length);
  const firstSlash = subPath.indexOf('/');

  if (!subPath.startsWith('@')) {
    return {
      path: fullPath,
      extractedModule: {
        package: subPath.substring(0, firstSlash),
        path: subPath.substring(firstSlash + 1),
      },
    };
  }

  const secondSlash = subPath.substring(firstSlash + 1).indexOf('/');
  return {
    path: fullPath,
    extractedModule: {
      package: subPath.substring(0, firstSlash + 1 + secondSlash),
      path: subPath.substring(firstSlash + 1 + secondSlash + 1),
    },
  };
}

function shouldIgnoreModule({
  namespace,
  path,
  importer,
  externalModules,
  pathPrefixesToIgnore,
}: {
  namespace: string;
  path: string;
  importer: string;
  externalModules?: string[];
  pathPrefixesToIgnore?: string[];
}): boolean {
  // If onLoad is being triggered from another plugin, ignore it
  if (namespace !== 'file') return true;
  // If it's a local import from our code, ignore it
  if (!importer.includes(NODE_MODULES) && path.startsWith('.')) return true;
  // If it starts with a prefix to ignore, ignore it
  if (pathPrefixesToIgnore?.some(prefix => path.startsWith(prefix))) {
    return true;
  }
  // If it's marked as external, ignore it
  if (externalModules?.includes(path)) return true;

  return false;
}

function isBuiltIn(path: string, extractedModule: ExtractedModule): boolean {
  return (
    BUILT_INS.has(path) ||
    BUILT_INS.has(`${extractedModule.package}/${extractedModule.path}`)
  );
}

async function getInstrumentation({
  extractedModule,
  path,
  resolveDir,
  build,
}: {
  extractedModule: ExtractedModule;
  path: string;
  resolveDir: string;
  build: PluginBuild;
}) {
  for (const instrumentation of instrumentations) {
    const moduleWithPackage = `${extractedModule.package}/${extractedModule.path}`;
    const nameMatches =
      instrumentation.name === path ||
      instrumentation.name === moduleWithPackage;

    if (!nameMatches) {
      const fileMatch = instrumentation.files.find(
        file => file.name === path || file.name === moduleWithPackage
      );
      if (!fileMatch) continue;
    }

    const { path: packageJsonPath } = await build.resolve(
      `${extractedModule.package}/package.json`,
      {
        resolveDir,
        kind: 'require-resolve',
      }
    );

    const packageJsonContents = await readFile(packageJsonPath);
    const version = JSON.parse(packageJsonContents.toString()).version;

    if (
      instrumentation.supportedVersions.some(supportedVersion =>
        satisfies(version, supportedVersion)
      )
    ) {
      return instrumentation;
    }
  }
  return null;
}
