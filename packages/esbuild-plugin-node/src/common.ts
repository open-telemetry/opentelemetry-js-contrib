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
  let mod = module.exports;

  const { ${oTelInstrumentationClass} } = require('${oTelInstrumentationPackage}');
  const instrumentations = new ${oTelInstrumentationClass}(${oTelInstrumentationConstructorArgs}).getModuleDefinitions();
  if (instrumentations.length > 1 && !'${instrumentationName}') {
    throw new Error('instrumentationName must be specified because ${oTelInstrumentationClass} has multiple instrumentations');
  }
  const instrumentation = ${
    instrumentationName
      ? `instrumentations.find(i => i.name === '${instrumentationName}')`
      : 'instrumentations[0]'
  };

  if (instrumentation.patch && instrumentation.files?.length) {
    throw new Error('Not sure how to handle patch and files on instrumentation for ${oTelInstrumentationClass} ${instrumentationName}');
  }

  if (!instrumentation.patch) {
    if (!instrumentation.files?.length) {
      throw new Error('No patch nor files exist on instrumentation for ${oTelInstrumentationClass} ${instrumentationName}');
    } else if (instrumentation.files.length > 1) {
      throw new Error('Not sure how to handle multiple files for nstrumentations for ${instrumentationName}');
    }
  }

  mod = instrumentation.patch?.(mod) ?? instrumentation.files[0].patch({ ...mod });
  module.exports = mod;
}
`;
}
