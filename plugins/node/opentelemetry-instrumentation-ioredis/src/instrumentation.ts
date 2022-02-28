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

import { diag, trace, context, SpanKind } from '@opentelemetry/api';
import type * as ioredisTypes from 'ioredis';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { IORedisInstrumentationConfig, IORedisCommand } from './types';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { endSpan, defaultDbStatementSerializer } from './utils';
import { VERSION } from './version';

const DEFAULT_CONFIG: IORedisInstrumentationConfig = {
  requireParentSpan: true,
};

export class IORedisInstrumentation extends InstrumentationBase<
  typeof ioredisTypes
> {
  constructor(_config: IORedisInstrumentationConfig = {}) {
    super(
      '@opentelemetry/instrumentation-ioredis',
      VERSION,
      Object.assign({}, DEFAULT_CONFIG, _config)
    );
  }

  init(): InstrumentationNodeModuleDefinition<typeof ioredisTypes>[] {
    return [
      new InstrumentationNodeModuleDefinition<typeof ioredisTypes>(
        'ioredis',
        ['>1 <5'],
        (moduleExports, moduleVersion?: string) => {
          diag.debug('Applying patch for ioredis');
          if (isWrapped(moduleExports.prototype.sendCommand)) {
            this._unwrap(moduleExports.prototype, 'sendCommand');
          }
          this._wrap(
            moduleExports.prototype,
            'sendCommand',
            this._patchSendCommand(moduleVersion)
          );
          if (isWrapped(moduleExports.prototype.connect)) {
            this._unwrap(moduleExports.prototype, 'connect');
          }
          this._wrap(
            moduleExports.prototype,
            'connect',
            this._patchConnection()
          );
          return moduleExports;
        },
        moduleExports => {
          if (moduleExports === undefined) return;
          diag.debug('Removing patch for ioredis');
          this._unwrap(moduleExports.prototype, 'sendCommand');
          this._unwrap(moduleExports.prototype, 'connect');
        }
      ),
    ];
  }

  /**
   * Patch send command internal to trace requests
   */
  private _patchSendCommand(moduleVersion?: string) {
    return (original: Function) => {
      return this.traceSendCommand(original, moduleVersion);
    };
  }

  private _patchConnection() {
    return (original: Function) => {
      return this.traceConnection(original);
    };
  }

  private traceSendCommand = (original: Function, moduleVersion?: string) => {
    const instrumentation = this;
    return function (this: ioredisTypes.Redis, cmd?: IORedisCommand) {
      if (arguments.length < 1 || typeof cmd !== 'object') {
        return original.apply(this, arguments);
      }
      const config =
        instrumentation.getConfig() as IORedisInstrumentationConfig;
      const dbStatementSerializer =
        config?.dbStatementSerializer || defaultDbStatementSerializer;

      const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
      if (config?.requireParentSpan === true && hasNoParentSpan) {
        return original.apply(this, arguments);
      }

      const span = instrumentation.tracer.startSpan(cmd.name, {
        kind: SpanKind.CLIENT,
        attributes: {
          [SemanticAttributes.DB_SYSTEM]: DbSystemValues.REDIS,
          [SemanticAttributes.DB_STATEMENT]: dbStatementSerializer(
            cmd.name,
            cmd.args
          ),
        },
      });

      if (config?.requestHook) {
        safeExecuteInTheMiddle(
          () =>
            config?.requestHook!(span, {
              moduleVersion,
              cmdName: cmd.name,
              cmdArgs: cmd.args,
            }),
          e => {
            if (e) {
              diag.error('ioredis instrumentation: request hook failed', e);
            }
          },
          true
        );
      }

      const { host, port } = this.options;

      span.setAttributes({
        [SemanticAttributes.NET_PEER_NAME]: host,
        [SemanticAttributes.NET_PEER_PORT]: port,
        [SemanticAttributes.DB_CONNECTION_STRING]: `redis://${host}:${port}`,
      });

      try {
        const result = original.apply(this, arguments);

        const origResolve = cmd.resolve;
        /* eslint-disable @typescript-eslint/no-explicit-any */
        cmd.resolve = function (result: any) {
          safeExecuteInTheMiddle(
            () => config?.responseHook?.(span, cmd.name, cmd.args, result),
            e => {
              if (e) {
                diag.error('ioredis instrumentation: response hook failed', e);
              }
            },
            true
          );

          endSpan(span, null);
          origResolve(result);
        };

        const origReject = cmd.reject;
        cmd.reject = function (err: Error) {
          endSpan(span, err);
          origReject(err);
        };

        return result;
      } catch (error) {
        endSpan(span, error);
        throw error;
      }
    };
  };

  private traceConnection = (original: Function) => {
    const instrumentation = this;
    return function (this: ioredisTypes.Redis) {
      const span = instrumentation.tracer.startSpan('connect', {
        kind: SpanKind.CLIENT,
        attributes: {
          [SemanticAttributes.DB_SYSTEM]: DbSystemValues.REDIS,
          [SemanticAttributes.DB_STATEMENT]: 'connect',
        },
      });
      const { host, port } = this.options;

      span.setAttributes({
        [SemanticAttributes.NET_PEER_NAME]: host,
        [SemanticAttributes.NET_PEER_PORT]: port,
        [SemanticAttributes.DB_CONNECTION_STRING]: `redis://${host}:${port}`,
      });
      try {
        const client = original.apply(this, arguments);
        endSpan(span, null);
        return client;
      } catch (error) {
        endSpan(span, error);
        throw error;
      }
    };
  };
}
