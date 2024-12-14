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

import type { ModuleParams } from './types';

export function wrapModule(
  originalSource: string,
  {
    path,
    moduleVersion,
    oTelInstrumentationPackage,
    oTelInstrumentationClass,
    instrumentationName,
    oTelInstrumentationConstructorArgs = '',
  }: ModuleParams
) {
  return `
(function() {
  ${originalSource}
})(...arguments);
{
  const { diag } = require('@opentelemetry/api');

  try {
    let mod = module.exports;

    const { satisfies } = require('semver');
    const { ${oTelInstrumentationClass} } = require('${oTelInstrumentationPackage}');
    const instrumentations = new ${oTelInstrumentationClass}(${oTelInstrumentationConstructorArgs}).getModuleDefinitions();

    for (const instrumentation of instrumentations.filter(i => i.name === '${instrumentationName}')) {
      if (!instrumentation.supportedVersions.some(v => satisfies('${moduleVersion}', v))) {
        diag.debug('Skipping instrumentation ${instrumentationName}, because module version ${moduleVersion} does not match supported versions ' + instrumentation.supportedVersions.join(','));
        continue;
      }

      if (instrumentation.patch) {
        diag.debug('Applying instrumentation patch ${instrumentationName} via esbuild-plugin-node');
        mod = instrumentation.patch(mod)
      }

      if (instrumentation.files?.length) {
        for (const file of instrumentation.files.filter(f => f.name === '${path}')) {
          if (!file.supportedVersions.some(v => satisfies('${moduleVersion}', v))) {
            diag.debug('Skipping instrumentation for ${path}@${moduleVersion} because it does not match supported versions' + file.supportedVersions.join(','));
            continue;
          }
          diag.debug('Applying instrumentation patch to ${path}@${moduleVersion} via esbuild-plugin-node');
          mod = file.patch(mod, '${moduleVersion}');
        }
      }
    }

    module.exports = mod;
  } catch (e) {
    diag.error('Error applying instrumentation ${instrumentationName}', e);
  }
}
`;
}
