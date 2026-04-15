/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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
        ['>=1.0.0'],
        /* istanbul ignore next */
        modExports => {
          this._diag.debug('Applying LangChain instrumentation');
          // TODO: Add instrumentation patches here
          return modExports;
        },
        /* istanbul ignore next */
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        modExports => {
          this._diag.debug('Removing LangChain instrumentation');
          // TODO: Add unwrap calls here, e.g.:
          // this._unwrap(modExports.SomeClass.prototype, 'someMethod');
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
