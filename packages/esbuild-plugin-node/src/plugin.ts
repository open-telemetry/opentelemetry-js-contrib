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
  instrumentationModuleDefinitions,
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

        // If it's a local import, don't patch it
        if (!extractedModule) return;

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

/**
 * For a given full path to a module,
 *   return the package name it belongs to and the local path to the module
 *   input: '/foo/node_modules/@co/stuff/foo/bar/baz.js'
 *   output: { package: '@co/stuff', path: 'foo/bar/baz.js' }
 */
function extractPackageAndModulePath(
  originalPath: string,
  resolveDir: string
): { path: string; extractedModule: ExtractedModule | null } {
  // @see https://github.com/nodejs/node/issues/47000
  const path = require.resolve(
    originalPath === '.' ? './' : originalPath === '..' ? '../' : originalPath,
    { paths: [resolveDir] }
  );

  const nodeModulesIndex = path.lastIndexOf(NODE_MODULES);
  if (nodeModulesIndex < 0) return { path, extractedModule: null };

  const subPath = path.substring(nodeModulesIndex + NODE_MODULES.length);
  const firstSlashIndex = subPath.indexOf('/');

  if (!subPath.startsWith('@')) {
    return {
      path,
      extractedModule: {
        package: subPath.substring(0, firstSlashIndex),
        path: subPath.substring(firstSlashIndex + 1),
      },
    };
  }

  const secondSlash = subPath.substring(firstSlashIndex + 1).indexOf('/');
  return {
    path,
    extractedModule: {
      package: subPath.substring(0, firstSlashIndex + secondSlash + 1),
      path: subPath.substring(firstSlashIndex + secondSlash + 2),
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
  for (const instrumentationModuleDefinition of instrumentationModuleDefinitions) {
    const moduleWithPackage = `${extractedModule.package}/${extractedModule.path}`;
    const nameMatches =
      instrumentationModuleDefinition.name === path ||
      instrumentationModuleDefinition.name === moduleWithPackage;

    if (!nameMatches) {
      const fileMatch = instrumentationModuleDefinition.files.find(
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
      instrumentationModuleDefinition.supportedVersions.some(supportedVersion =>
        satisfies(version, supportedVersion)
      )
    ) {
      return instrumentationModuleDefinition;
    }
  }
  return null;
}
