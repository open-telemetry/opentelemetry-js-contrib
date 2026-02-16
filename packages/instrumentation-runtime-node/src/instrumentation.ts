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
import { InstrumentationBase } from '@opentelemetry/instrumentation';
import type { AnyValueMap, LogRecord } from '@opentelemetry/api-logs';
import { SeverityNumber } from '@opentelemetry/api-logs';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';
import { hrTime } from '@opentelemetry/core';

import { RuntimeNodeInstrumentationConfig } from './types';
import { MetricCollector } from './types/metricCollector';
import { EventLoopUtilizationCollector } from './metrics/eventLoopUtilizationCollector';
import { EventLoopDelayCollector } from './metrics/eventLoopDelayCollector';
import { GCCollector } from './metrics/gcCollector';
import { HeapSpacesSizeAndUsedCollector } from './metrics/heapSpacesSizeAndUsedCollector';
import { EventLoopTimeCollector } from './metrics/eventLoopTimeCollector';
/** @knipignore */
import { PACKAGE_VERSION, PACKAGE_NAME } from './version';

const DEFAULT_CONFIG: RuntimeNodeInstrumentationConfig = {
  monitoringPrecision: 10,
  captureUncaughtException: true,
  captureUnhandledRejection: true,
};

export class RuntimeNodeInstrumentation extends InstrumentationBase<RuntimeNodeInstrumentationConfig> {
  private readonly _collectors: MetricCollector[] = [];
  private _onUncaughtExceptionHandler?: (
    error: Error,
    origin: NodeJS.UncaughtExceptionOrigin
  ) => void;
  private _onUnhandledRejectionHandler?: (
    reason: unknown,
    promise: Promise<unknown>
  ) => void;

  constructor(config: RuntimeNodeInstrumentationConfig = {}) {
    super(
      PACKAGE_NAME,
      PACKAGE_VERSION,
      Object.assign({}, DEFAULT_CONFIG, config)
    );
    this._collectors = [
      new EventLoopUtilizationCollector(this._config),
      new EventLoopTimeCollector(this._config),
      new EventLoopDelayCollector(this._config),
      new GCCollector(this._config),
      new HeapSpacesSizeAndUsedCollector(this._config),
    ];
    if (this._config.enabled) {
      for (const collector of this._collectors) {
        collector.enable();
      }
      this._registerExceptionHandlers();
    }
  }

  // Called when a new `MeterProvider` is set
  // the Meter (result of @opentelemetry/api's getMeter) is available as this.meter within this method
  override _updateMetricInstruments() {
    if (!this._collectors) return;
    for (const collector of this._collectors) {
      collector.updateMetricInstruments(this.meter);
    }
  }

  init() {
    // Not instrumenting or patching a Node.js module
  }

  override enable() {
    super.enable();
    if (!this._collectors) return;

    for (const collector of this._collectors) {
      collector.enable();
    }
    this._registerExceptionHandlers();
  }

  override disable() {
    super.disable();
    for (const collector of this._collectors) {
      collector.disable();
    }
    this._unregisterExceptionHandlers();
  }

  private _registerExceptionHandlers() {
    const config = this.getConfig();
    if (config.captureUncaughtException && !this._onUncaughtExceptionHandler) {
      this._onUncaughtExceptionHandler =
        this._handleUncaughtException.bind(this);
      process.on('uncaughtExceptionMonitor', this._onUncaughtExceptionHandler);
    }

    if (
      config.captureUnhandledRejection &&
      !this._onUnhandledRejectionHandler
    ) {
      this._onUnhandledRejectionHandler =
        this._handleUnhandledRejection.bind(this);
      process.on('unhandledRejection', this._onUnhandledRejectionHandler);
    }
  }

  private _unregisterExceptionHandlers() {
    if (this._onUncaughtExceptionHandler) {
      process.removeListener(
        'uncaughtExceptionMonitor',
        this._onUncaughtExceptionHandler
      );
      this._onUncaughtExceptionHandler = undefined;
    }

    if (this._onUnhandledRejectionHandler) {
      process.removeListener(
        'unhandledRejection',
        this._onUnhandledRejectionHandler
      );
      this._onUnhandledRejectionHandler = undefined;
    }
  }

  private _handleUncaughtException(
    error: Error,
    _origin: NodeJS.UncaughtExceptionOrigin
  ) {
    this._emitExceptionLog(error, SeverityNumber.FATAL, 'uncaughtException');
  }

  private _handleUnhandledRejection(reason: unknown) {
    this._emitExceptionLog(reason, SeverityNumber.ERROR, 'unhandledRejection');
  }

  private _emitExceptionLog(
    error: unknown,
    severityNumber: SeverityNumber,
    eventType: 'uncaughtException' | 'unhandledRejection'
  ) {
    if (!this.isEnabled()) {
      return;
    }

    const config = this.getConfig();
    let customAttributes: AnyValueMap = {};
    if (config.applyCustomAttributes) {
      try {
        customAttributes = config.applyCustomAttributes(error, eventType) ?? {};
      } catch (err) {
        this._diag.error(
          'applyCustomAttributes threw while handling an exception',
          err
        );
      }
    }

    const errorAttributes = this._getExceptionAttributes(error);
    const timestamp = hrTime();
    const errorLog: LogRecord = {
      body: 'exception',
      severityNumber,
      attributes: { ...errorAttributes, ...customAttributes },
      timestamp,
      observedTimestamp: timestamp,
    };

    this.logger.emit(errorLog);
  }

  private _getExceptionAttributes(error: unknown): AnyValueMap {
    if (error instanceof Error) {
      return {
        [ATTR_EXCEPTION_TYPE]: error.name,
        [ATTR_EXCEPTION_MESSAGE]: error.message,
        [ATTR_EXCEPTION_STACKTRACE]: error.stack,
      };
    }

    if (typeof error === 'string') {
      return {
        [ATTR_EXCEPTION_MESSAGE]: error,
      };
    }

    if (error && typeof error === 'object') {
      const maybeName = (error as { name?: unknown }).name;
      const maybeMessage = (error as { message?: unknown }).message;
      const maybeStack = (error as { stack?: unknown }).stack;

      return {
        ...(typeof maybeName === 'string'
          ? { [ATTR_EXCEPTION_TYPE]: maybeName }
          : {}),
        ...(typeof maybeMessage === 'string'
          ? { [ATTR_EXCEPTION_MESSAGE]: maybeMessage }
          : {
              [ATTR_EXCEPTION_MESSAGE]: String(error),
            }),
        ...(typeof maybeStack === 'string'
          ? { [ATTR_EXCEPTION_STACKTRACE]: maybeStack }
          : {}),
      };
    }

    return {
      [ATTR_EXCEPTION_MESSAGE]: String(error),
    };
  }
}
