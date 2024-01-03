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
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import type { WinstonInstrumentationConfig } from './types';
import type {
  Winston2ConfigureMethod,
  Winston2LogMethod,
  Winston2LoggerModule,
  Winston3ConfigureMethod,
  Winston3LogMethod,
  Winston3Logger,
} from './internal-types';
import { VERSION } from './version';
import { OpenTelemetryTransportv3 } from './OpenTelemetryTransportv3';
import { OpenTelemetryTransportv2 } from './OpenTelemetryTransportv2';

const winston3Versions = ['>=3 <4'];
const winstonPre3Versions = ['>=1 <3'];

export class WinstonInstrumentation extends InstrumentationBase {
  constructor(config: WinstonInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-winston', VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<{}>(
        'winston',
        winston3Versions,
        moduleExports => moduleExports,
        () => {},
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

              // Wrap configure
              if (isWrapped(logger.prototype['configure'])) {
                this._unwrap(logger.prototype, 'configure');
              }
              this._wrap(
                logger.prototype,
                'configure',
                this._getPatchedV3Configure()
              );

              return logger;
            },
            (logger, moduleVersion) => {
              if (logger === undefined) return;
              this._diag.debug(`Removing patch for winston@${moduleVersion}`);
              this._unwrap(logger.prototype, 'write');
              this._unwrap(logger.prototype, 'configure');
            }
          ),
        ]
      ),
      new InstrumentationNodeModuleDefinition<{}>(
        'winston',
        winstonPre3Versions,
        moduleExports => moduleExports,
        () => {},
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

              // Wrap configure
              if (isWrapped(proto.configure)) {
                this._unwrap(proto, 'configure');
              }
              this._wrap(proto, 'configure', this._getPatchedV2Configure());

              return fileExports;
            },
            (fileExports, moduleVersion) => {
              if (fileExports === undefined) return;
              this._diag.debug(`Removing patch for winston@${moduleVersion}`);
              this._unwrap(fileExports.Logger.prototype, 'log');
              this._unwrap(fileExports.Logger.prototype, 'configure');
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

        return original.apply(this, args);
      };
    };
  }

  private _getPatchedV3Configure() {
    return (original: Winston3ConfigureMethod) => {
      const instrumentation = this;
      return function patchedConfigure(
        this: never,
        ...args: Parameters<typeof original>
      ) {
        const config = instrumentation.getConfig();
        if (!config.disableLogSending) {
          if (args && args.length > 0) {
            let originalTransports = args[0].transports;
            let newTransports = Array.isArray(originalTransports)
              ? originalTransports
              : [];
            const openTelemetryTransport = new OpenTelemetryTransportv3();
            if (originalTransports && !Array.isArray(originalTransports)) {
              newTransports = [originalTransports];
            }
            newTransports.push(openTelemetryTransport);
            originalTransports = newTransports;
          }
        }
        return original.apply(this, args);
      };
    };
  }

  private _getPatchedV2Configure() {
    return (original: Winston2ConfigureMethod) => {
      const instrumentation = this;
      return function patchedConfigure(
        this: never,
        ...args: Parameters<typeof original>
      ) {
        const config = instrumentation.getConfig();
        if (!config.disableLogSending) {
          if (args && args.length > 0) {
            let originalTransports = args[0].transports;
            let newTransports = Array.isArray(originalTransports)
              ? originalTransports
              : [];
            const openTelemetryTransport = new OpenTelemetryTransportv2();
            if (originalTransports && !Array.isArray(originalTransports)) {
              newTransports = [originalTransports];
            }
            newTransports.push(openTelemetryTransport);
            originalTransports = newTransports;
          }
        }
        return original.apply(this, args);
      };
    };
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
