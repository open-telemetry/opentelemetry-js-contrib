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
import type {
  AnyValueMap,
  LogRecord,
  LoggerProvider,
} from '@opentelemetry/api-logs';
import { SeverityNumber } from '@opentelemetry/api-logs';
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
  captureUncaughtException: false,
};

export class RuntimeNodeInstrumentation extends InstrumentationBase<RuntimeNodeInstrumentationConfig> {
  private readonly _collectors: MetricCollector[] = [];
  private _loggerProvider?: LoggerProvider;
  private _onUncaughtExceptionHandler?: (
    error: Error,
    origin: NodeJS.UncaughtExceptionOrigin
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

  override setLoggerProvider(loggerProvider: LoggerProvider): void {
    super.setLoggerProvider(loggerProvider);
    this._loggerProvider = loggerProvider;
  }

  private _registerExceptionHandlers() {
    const config = this.getConfig();
    if (config.captureUncaughtException && !this._onUncaughtExceptionHandler) {
      this._onUncaughtExceptionHandler =
        this._handleUncaughtException.bind(this);
      process.on('uncaughtExceptionMonitor', this._onUncaughtExceptionHandler);
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
  }

  private _handleUncaughtException(
    error: Error,
    _origin: NodeJS.UncaughtExceptionOrigin
  ) {
    this._emitExceptionLog(error, SeverityNumber.FATAL, 'uncaughtException');
  }

  private _emitExceptionLog(
    error: unknown,
    severityNumber: SeverityNumber,
    eventType: 'uncaughtException'
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

    const timestamp = hrTime();
    const errorLog: LogRecord = {
      body: 'exception',
      exception: error,
      severityNumber,
      attributes: customAttributes,
      timestamp,
      observedTimestamp: timestamp,
    };

    this.logger.emit(errorLog);
    this._forceFlushLogs();
  }

  private _forceFlushLogs() {
    const loggerProvider = this._loggerProvider as
      | (LoggerProvider & { forceFlush?: () => Promise<void> })
      | undefined;
    if (typeof loggerProvider?.forceFlush !== 'function') {
      return;
    }

    try {
      void loggerProvider.forceFlush().catch(err => {
        this._diag.error(
          'loggerProvider.forceFlush failed while handling an exception',
          err
        );
      });
    } catch (err) {
      this._diag.error(
        'loggerProvider.forceFlush threw while handling an exception',
        err
      );
    }
  }
}
