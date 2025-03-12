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
  InstrumentationConfig,
} from '@opentelemetry/instrumentation';
import {
  ATTR_EXCEPTION_TYPE,
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
} from '@opentelemetry/semantic-conventions';
// TODO: should events be imported or included as part of the instrumentation base class?
import { events } from '@opentelemetry/api-events';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { Attributes } from '@opentelemetry/api';
import { hrTime } from '@opentelemetry/core';

export interface GlobalErrorsInstrumentationConfig
  extends InstrumentationConfig {
  /**
   * A callback function for adding custom attributes to the span when an error is recorded.
   *
   * @param {Error} error - The error object that is being recorded.
   * @returns {Attributes} - The attributes to add to the span.
   */
  applyCustomAttributes?: (error: Error) => Attributes;
}

export class WebExceptionInstrumentation extends InstrumentationBase<GlobalErrorsInstrumentationConfig> {
  readonly applyCustomAttributes?: (error: Error) => Attributes;
  constructor(config: GlobalErrorsInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-web-exception', '0.0.1', config);

    this.applyCustomAttributes = config.applyCustomAttributes;
  }

  init() {}

  onError = (event: ErrorEvent | PromiseRejectionEvent) => {
    const error: Error | undefined =
      'reason' in event ? event.reason : event.error;
    if (error) {
      const message = error.message;
      const type = error.name;
      const errorAttributes = {
        [ATTR_EXCEPTION_TYPE]: type,
        [ATTR_EXCEPTION_MESSAGE]: message,
        [ATTR_EXCEPTION_STACKTRACE]: error.stack,
      };

      const eventLogger = events.getEventLogger(
        this.instrumentationName,
        this.instrumentationVersion
      );

      const customAttributes = this.applyCustomAttributes
        ? this.applyCustomAttributes(error)
        : {};

      eventLogger.emit({
        name: 'exception',
        data: { ...errorAttributes, ...customAttributes },
        severityNumber: SeverityNumber.ERROR,
        timestamp: hrTime(),
      });
    }
  };

  override disable(): void {
    window.removeEventListener('error', this.onError);
    window.removeEventListener('unhandledrejection', this.onError);
  }

  override enable(): void {
    window.addEventListener('error', this.onError);
    window.addEventListener('unhandledrejection', this.onError);
  }
}
