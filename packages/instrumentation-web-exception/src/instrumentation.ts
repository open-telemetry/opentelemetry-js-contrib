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
  type InstrumentationConfig,
} from '@opentelemetry/instrumentation';
import {
  ATTR_EXCEPTION_TYPE,
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
} from '@opentelemetry/semantic-conventions';
import type { Attributes } from '@opentelemetry/api';
import {
  SeverityNumber,
  logs,
  type LogRecord,
  type AnyValueMap,
} from '@opentelemetry/api-logs';
import { hrTime } from '@opentelemetry/core';

/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

export interface GlobalErrorsInstrumentationConfig
  extends InstrumentationConfig {
  /**
   * A callback function for adding custom attributes to the log event when an error is recorded.
   *
   * @param {Error} error - The error object that is being recorded.
   * @returns {Attributes} - The attributes to add to the span.
   */
  applyCustomAttributes?: (error: Error | string) => Attributes;
}

export class ExceptionInstrumentation extends InstrumentationBase<GlobalErrorsInstrumentationConfig> {
  constructor(config: GlobalErrorsInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
    this.onError = this.onError.bind(this);
  }

  init() { }

  onError(event: ErrorEvent | PromiseRejectionEvent) {
    const EXCEPTION_EVENT_NAME = 'exception';
    const error: Error | string | undefined =
      'reason' in event ? event.reason : event.error;

    if (error === undefined) {
      return;
    }

    const logger = logs
      .getLoggerProvider()
      .getLogger(this.instrumentationName, this.instrumentationVersion);

    const config = this.getConfig();
    const customAttributes = config.applyCustomAttributes
      ? config.applyCustomAttributes(error)
      : {};

    let errorAttributes: AnyValueMap = {};

    if (typeof error === 'string') {
      errorAttributes = { [ATTR_EXCEPTION_MESSAGE]: error };
    } else {
      errorAttributes = {
        [ATTR_EXCEPTION_TYPE]: error.name,
        [ATTR_EXCEPTION_MESSAGE]: error.message,
        [ATTR_EXCEPTION_STACKTRACE]: error.stack,
      };
    }

    const errorLog: LogRecord = {
      eventName: EXCEPTION_EVENT_NAME,
      severityNumber: SeverityNumber.ERROR,
      attributes: { ...errorAttributes, ...customAttributes },
      timestamp: hrTime(),
      observedTimestamp: hrTime(),
    };

    logger.emit(errorLog);
  }

  override disable(): void {
    window.removeEventListener('error', this.onError);
    window.removeEventListener('unhandledrejection', this.onError);
  }

  override enable(): void {
    window.addEventListener('error', this.onError);
    window.addEventListener('unhandledrejection', this.onError);
  }
}
