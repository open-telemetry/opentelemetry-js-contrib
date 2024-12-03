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
  PluginData,
} from './types';
import { Plugin, PluginBuild } from 'esbuild';
import { dirname, join } from 'path';
import {
  instrumentationModuleDefinitions,
  otelPackageToInstrumentationConfig,
} from './config/main';

import { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { builtinModules } from 'module';
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

        let path;
        let extractedModule;

        try {
          const result = extractPackageAndModulePath(
            args.path,
            args.resolveDir
          );
          path = result.path;
          extractedModule = result.extractedModule;
        } catch (e) {
          // Some libraries like `mongodb` require optional dependencies, which may not be present and their absence doesn't break the code
          // Currently esbuild doesn't provide any better way to handle this in plugins: https://github.com/evanw/esbuild/issues/1127
        }

        // If it's a local import, don't patch it
        if (!extractedModule) return;

        // We'll rely on the OTel auto-instrumentation at runtime to patch builtin modules
        if (isBuiltIn(args.path, extractedModule)) return;

        const moduleVersion = await getModuleVersion({
          extractedModule,
          resolveDir: args.resolveDir,
          build,
        });
        if (!moduleVersion) return;

        // See if we have an instrumentation registered for this package
        const matchingInstrumentation = getInstrumentation({
          extractedModule,
          moduleVersion,
          path: args.path,
        });
        if (!matchingInstrumentation) return;

        const pluginData: PluginData = {
          extractedModule,
          moduleVersion,
          shouldPatchPackage: true,
          instrumentationName: matchingInstrumentation.name,
        };

        return { path, pluginData };
      });

      build.onLoad(
        { filter: /.*/ },
        async ({ path, pluginData }: OnLoadArgs) => {
          // Ignore any packages that don't have an instrumentation registered for them
          if (!pluginData?.shouldPatchPackage) return;

          const contents = await readFile(path);

          const config =
            otelPackageToInstrumentationConfig[pluginData.instrumentationName];
          if (!config) return;

          // console.log('config is', config);
          const packageConfig =
            pluginConfig?.instrumentationConfig?.[
              config.oTelInstrumentationPackage
            ];
          const extractedModule = pluginData.extractedModule;

          return {
            contents: wrapModule(contents.toString(), {
              path: join(
                extractedModule.package || '',
                extractedModule.path || ''
              ),
              moduleVersion: pluginData.moduleVersion,
              instrumentationName: pluginData.instrumentationName,
              oTelInstrumentationClass: config.oTelInstrumentationClass,
              oTelInstrumentationPackage: config.oTelInstrumentationPackage,
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

const moduleVersionByPackageJsonPath = new Map<string, string>();

async function getModuleVersion({
  extractedModule,
  resolveDir,
  build,
}: {
  extractedModule: ExtractedModule;
  resolveDir: string;
  build: PluginBuild;
}) {
  const path = `${extractedModule.package}/package.json`;
  const contents = moduleVersionByPackageJsonPath.get(path);
  if (contents) return contents;

  const { path: packageJsonPath } = await build.resolve(path, {
    resolveDir,
    kind: 'require-resolve',
  });
  if (!packageJsonPath) return;

  const packageJsonContents = await readFile(packageJsonPath);
  const moduleVersion = JSON.parse(packageJsonContents.toString()).version;
  moduleVersionByPackageJsonPath.set(path, moduleVersion);
  return moduleVersion;
}

function getInstrumentation({
  extractedModule,
  path,
  moduleVersion,
}: {
  extractedModule: ExtractedModule;
  path: string;
  moduleVersion: string;
}): InstrumentationModuleDefinition | null {
  for (const instrumentationModuleDefinition of instrumentationModuleDefinitions) {
    const fullModulePath = `${extractedModule.package}/${extractedModule.path}`;
    const nameMatches =
      instrumentationModuleDefinition.name === path ||
      instrumentationModuleDefinition.name === fullModulePath;

    if (!nameMatches) {
      const fileMatch = instrumentationModuleDefinition.files.find(file => {
        return file.name === path || file.name === fullModulePath;
      });
      if (!fileMatch) continue;
    }

    if (
      instrumentationModuleDefinition.supportedVersions.some(supportedVersion =>
        satisfies(moduleVersion, supportedVersion)
      )
    ) {
      return instrumentationModuleDefinition;
    }

    if (
      instrumentationModuleDefinition.files.some(file => {
        if (file.name !== path && file.name !== fullModulePath) return false;
        return file.supportedVersions.some(supportedVersion =>
          satisfies(moduleVersion, supportedVersion)
        );
      })
    ) {
      return instrumentationModuleDefinition;
    }
  }
  return null;
}
