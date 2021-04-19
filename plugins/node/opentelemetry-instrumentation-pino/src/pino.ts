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
  diag,
  getSpan,
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
import {
  Pino,
  PinoInstrumentationConfig,
  PinoLogger,
  PinoGenLsCacheFunction,
} from './types';
import { VERSION } from './version';
import * as semver from 'semver';

const pinoVersions = ['>=5 <7'];
const pino5Versions = '5.x';
const pino6Versions = '6.x';

export class PinoInstrumentation extends InstrumentationBase {
  _pinoWriteSym: symbol | undefined;
  _instrumentedLoggers = new Set<PinoLogger>();

  constructor(config: PinoInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-pino', VERSION, config);
  }

  protected init() {
    return [
      new InstrumentationNodeModuleDefinition<Pino>(
        'pino',
        pinoVersions,
        (pinoModule, version) => {
          if (version === undefined) {
            return pinoModule;
          }

          if (semver.satisfies(version, pino5Versions)) {
            const proto = Object.getPrototypeOf(pinoModule());

            if (isWrapped(proto[pinoModule.symbols.writeSym])) {
              this._unwrap(proto, pinoModule.symbols.writeSym);
            }

            this._wrap(
              proto,
              pinoModule.symbols.writeSym,
              this._getPatchedWrite()
            );
          } else if (semver.satisfies(version, pino6Versions)) {
            this._pinoWriteSym = pinoModule.symbols.writeSym;
          }

          return pinoModule;
        },
        (pinoModule, version) => {
          if (pinoModule === undefined || version === undefined) return;

          if (semver.satisfies(version, pino5Versions)) {
            this._unwrap(
              Object.getPrototypeOf(pinoModule()),
              pinoModule.symbols.writeSym
            );
          } else if (semver.satisfies(version, pino6Versions)) {
            if (this._pinoWriteSym !== undefined) {
              for (const logger of this._instrumentedLoggers) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this._unwrap(logger as any, this._pinoWriteSym);
              }
              this._instrumentedLoggers.clear();
            }
            this._pinoWriteSym = undefined;
          }
        },
        [
          new InstrumentationNodeModuleFile<{
            genLsCache: PinoGenLsCacheFunction;
          }>(
            'pino/lib/levels.js',
            [pino6Versions],
            fileExports => {
              if (isWrapped(fileExports.genLsCache)) {
                this._unwrap(fileExports, 'genLsCache');
              }

              this._wrap(
                fileExports,
                'genLsCache',
                this._getPatchedGenLsCache()
              );

              return fileExports;
            },
            fileExports => {
              if (fileExports === undefined) return;
              this._unwrap(fileExports, 'genLsCache');
            }
          ),
        ]
      ),
    ];
  }

  getConfig(): PinoInstrumentationConfig {
    return this._config;
  }

  setConfig(config: PinoInstrumentationConfig) {
    this._config = config;
  }

  private _callHook(span: Span, record: Record<string, string>) {
    const hook = this.getConfig().logHook;

    if (!hook) {
      return;
    }

    safeExecuteInTheMiddle(
      () => hook(span, record),
      err => {
        if (err) {
          diag.error('pino instrumentation: error calling logHook', err);
        }
      },
      true
    );
  }

  private _getPatchedGenLsCache() {
    return (original: PinoGenLsCacheFunction) => {
      const instrumentation = this;
      return function patchedGenLsCache(logger: PinoLogger): PinoLogger {
        if (instrumentation._pinoWriteSym === undefined) {
          return logger;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyLogger = logger as any;
        const pinoWrite = anyLogger[instrumentation._pinoWriteSym];

        if (pinoWrite === undefined) {
          return logger;
        }

        instrumentation._wrap(
          anyLogger,
          instrumentation._pinoWriteSym,
          instrumentation._getPatchedWrite()
        );
        instrumentation._instrumentedLoggers.add(logger);

        return original(logger);
      };
    };
  }

  private _getPatchedWrite() {
    return (
      original: (record: Record<string, string> | undefined | null) => void
    ) => {
      const instrumentation = this;
      return function patchedWrite(
        this: PinoLogger,
        ...args: Parameters<typeof original>
      ) {
        const span = getSpan(context.active());

        if (!span) {
          return original.apply(this, args);
        }

        const spanContext = span.context();

        if (!isSpanContextValid(spanContext)) {
          return original.apply(this, args);
        }

        const record = patchedRecord(spanContext, args[0]);
        instrumentation._callHook(span, record);

        args[0] = record;

        return original.apply(this, args);
      };
    };
  }
}

function patchedRecord(
  spanContext: SpanContext,
  record: Record<string, string> | undefined | null
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
