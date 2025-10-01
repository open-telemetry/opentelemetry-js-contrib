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
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
} from '@opentelemetry/instrumentation';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
import { LangChainInstrumentationConfig } from './types';

export class LangChainInstrumentation extends InstrumentationBase<LangChainInstrumentationConfig> {
  constructor(config: LangChainInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  // Override InstrumentationAbstract.setConfig so we can normalize config.
  override setConfig(config: LangChainInstrumentationConfig = {}) {
    const { captureMessageContent, ...validConfig } = config;
    (validConfig as LangChainInstrumentationConfig).captureMessageContent =
      !!captureMessageContent;
    super.setConfig(validConfig);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition(
        'langchain',
        ['>=0.1.0'],
        modExports => {
          this._diag.debug('Applying LangChain instrumentation');
          // TODO: Add instrumentation patches here
          return modExports;
        },
        modExports => {
          this._diag.debug('Removing LangChain instrumentation');
          // TODO: Add unwrap calls here
        }
      ),
    ];
  }

  // This is a 'protected' method on class `InstrumentationAbstract`.
  override _updateMetricInstruments() {
    // TODO: Create metric instruments here if needed
    // Example:
    // this._genaiClientOperationDuration = this.meter.createHistogram(
    //   METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
    //   { description: 'GenAI operation duration', unit: 's' }
    // );
  }
}
