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
  context,
  trace,
  isSpanContextValid,
  Span,
  SpanContext,
} from '@opentelemetry/api';
import * as util from 'node:util';
import {
  LogRecord,
  Logger,
  SeverityNumber,
  logs,
} from '@opentelemetry/api-logs';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import type { WinstonInstrumentationConfig } from './types';
import type {
  Winston2LogMethod,
  Winston2LoggerModule,
  Winston3LogMethod,
  Winston3Logger,
} from './internal-types';
import { VERSION } from './version';

const winston3Versions = ['>=3 <4'];
const winstonPre3Versions = ['>=1 <3'];

export class WinstonInstrumentation extends InstrumentationBase {
  private _logger: Logger;

  constructor(config: WinstonInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-winston', VERSION, config);
    this._logger = logs.getLogger(
      '@opentelemetry/instrumentation-winston',
      VERSION
    );
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<{}>(
        'winston',
        winston3Versions,
        moduleExports => moduleExports,
        () => { },
        [
          new InstrumentationNodeModuleFile<Winston3Logger>(
            'winston/lib/winston/logger.js',
            winston3Versions,
            (logger, moduleVersion) => {
              this._diag.debug(`Applying patch for winston@${moduleVersion}`);
              if (isWrapped(logger.prototype['write'])) {
                this._unwrap(logger.prototype, 'write');
              }
              this._wrap(logger.prototype, 'write', this._getPatchedWrite());

              return logger;
            },
            (logger, moduleVersion) => {
              if (logger === undefined) return;
              this._diag.debug(`Removing patch for winston@${moduleVersion}`);
              this._unwrap(logger.prototype, 'write');
            }
          ),
        ]
      ),
      new InstrumentationNodeModuleDefinition<{}>(
        'winston',
        winstonPre3Versions,
        moduleExports => moduleExports,
        () => { },
        [
          new InstrumentationNodeModuleFile<Winston2LoggerModule>(
            'winston/lib/winston/logger.js',
            winstonPre3Versions,
            (fileExports, moduleVersion) => {
              this._diag.debug(`Applying patch for winston@${moduleVersion}`);
              const proto = fileExports.Logger.prototype;

              if (isWrapped(proto.log)) {
                this._unwrap(proto, 'log');
              }
              this._wrap(proto, 'log', this._getPatchedLog());

              return fileExports;
            },
            (fileExports, moduleVersion) => {
              if (fileExports === undefined) return;
              this._diag.debug(`Removing patch for winston@${moduleVersion}`);
              this._unwrap(fileExports.Logger.prototype, 'log');
            }
          ),
        ]
      ),
    ];
  }

  override getConfig(): WinstonInstrumentationConfig {
    return this._config;
  }

  override setConfig(config: WinstonInstrumentationConfig) {
    this._config = config;
  }

  private _callHook(span: Span, record?: Record<string, string>) {
    const hook = this.getConfig().logHook;

    if (!hook || !record) {
      return;
    }

    safeExecuteInTheMiddle(
      () => hook(span, record),
      err => {
        if (err) {
          this._diag.error('error calling logHook', err);
        }
      },
      true
    );
  }

  private _getPatchedWrite() {
    return (original: Winston3LogMethod) => {
      const instrumentation = this;
      return function patchedWrite(
        this: never,
        ...args: Parameters<typeof original>
      ) {
        const config = instrumentation.getConfig();
        const record = args[0];

        if (!config.disableLogCorrelation) {
          const span = trace.getActiveSpan();
          if (span) {
            const spanContext = span.spanContext();
            if (isSpanContextValid(spanContext)) {
              injectRecord(spanContext, record);
              instrumentation._callHook(span, record);
            }
          }
        }

        if (!config.disableLogSending) {
          instrumentation._emitLogRecord(record);
        }

        return original.apply(this, args);
      };
    };
  }

  private _getPatchedLog() {
    return (original: Winston2LogMethod) => {
      const instrumentation = this;
      return function patchedLog(
        this: never,
        ...args: Parameters<typeof original>
      ) {
        let record: Record<string, any> = {};
        const config = instrumentation.getConfig();
        if (!config.disableLogCorrelation) {
          const span = trace.getSpan(context.active());
          if (span) {
            const spanContext = span.spanContext();
            if (isSpanContextValid(spanContext)) {
              record = injectRecord(spanContext, record);
              instrumentation._callHook(span, record);
              // Inject in metadata argument
              let isDataInjected = false;
              for (let i = args.length - 1; i >= 0; i--) {
                if (typeof args[i] === 'object') {
                  args[i] = Object.assign(args[i], record);
                  isDataInjected = true;
                  break;
                }
              }
              if (!isDataInjected) {
                const insertAt =
                  typeof args[args.length - 1] === 'function'
                    ? args.length - 1
                    : args.length;

                args.splice(insertAt, 0, record);
              }
            }
          }
        }

        if (!config.disableLogSending) {
          const logRecord: Record<string, any> = {};
          if (args.length >= 1) {
            // Level is always first argument
            logRecord['level'] = args[0];

            // Get meta if present
            let metaIndex = 0;
            for (let i = args.length - 1; i >= 0; i--) {
              if (typeof args[i] === 'object') {
                metaIndex = i;
                logRecord['meta'] = args[metaIndex];
                break;
              }
            }
            const callback =
              typeof args[args.length - 1] === 'function' ? 1 : 0;
            // Arguments between level and meta or callbkack if present
            const msgArguments = args.length - metaIndex - callback - 1;

            if (msgArguments > 0) {
              if (msgArguments === 1) {
                logRecord['msg'] = args[1];
              } else {
                // Handle string interpolation
                const values = args.slice(2, msgArguments + 1);
                logRecord['msg'] = util.format(args[1], ...values);
              }
            }
          }
          instrumentation._emitLogRecord(logRecord);
        }

        return original.apply(this, args);
      };
    };
  }

  private _emitLogRecord(record: Record<string, any>): void {
    const { message, msg, level, meta, ...splat } = record;
    const attributes = Object.assign(meta, {});
    for (const key in splat) {
      if (Object.prototype.hasOwnProperty.call(splat, key)) {
        attributes[key] = splat[key];
      }
    }
    const logRecord: LogRecord = {
      severityNumber: getSeverityNumber(level),
      severityText: level,
      body: message ?? msg,
      attributes: attributes,
    };
    this._logger.emit(logRecord);
  }
}

function injectRecord(
  spanContext: SpanContext,
  record?: Record<string, string>
) {
  const fields = {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: `0${spanContext.traceFlags.toString(16)}`,
  };

  if (!record) {
    return fields;
  }

  return Object.assign(record, fields);
}

const npmLevels: Record<string, number> = {
  error: SeverityNumber.ERROR,
  warn: SeverityNumber.WARN,
  info: SeverityNumber.INFO,
  http: SeverityNumber.DEBUG3,
  verbose: SeverityNumber.DEBUG2,
  debug: SeverityNumber.DEBUG,
  silly: SeverityNumber.TRACE,
};

const sysLoglevels: Record<string, number> = {
  emerg: SeverityNumber.FATAL3,
  alert: SeverityNumber.FATAL2,
  crit: SeverityNumber.FATAL,
  error: SeverityNumber.ERROR,
  warning: SeverityNumber.WARN,
  notice: SeverityNumber.INFO2,
  info: SeverityNumber.INFO,
  debug: SeverityNumber.DEBUG,
};

const cliLevels: Record<string, number> = {
  error: SeverityNumber.ERROR,
  warn: SeverityNumber.WARN,
  help: SeverityNumber.INFO3,
  data: SeverityNumber.INFO2,
  info: SeverityNumber.INFO,
  debug: SeverityNumber.DEBUG,
  prompt: SeverityNumber.TRACE4,
  verbose: SeverityNumber.TRACE3,
  input: SeverityNumber.TRACE2,
  silly: SeverityNumber.TRACE,
};

function getSeverityNumber(level: string): SeverityNumber | undefined {
  return npmLevels[level] ?? sysLoglevels[level] ?? cliLevels[level];
}
