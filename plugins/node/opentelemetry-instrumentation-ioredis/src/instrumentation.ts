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
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
} from '@opentelemetry/instrumentation';
import { IORedisInstrumentationConfig } from './types';
import { IORedisCommand, RedisInterface } from './internal-types';
import {
  DBSYSTEMVALUES_REDIS,
  SEMATTRS_DB_CONNECTION_STRING,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
} from '@opentelemetry/semantic-conventions';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { endSpan } from './utils';
import { defaultDbStatementSerializer } from '@opentelemetry/redis-common';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

const DEFAULT_CONFIG: IORedisInstrumentationConfig = {
  requireParentSpan: true,
};

export class IORedisInstrumentation extends InstrumentationBase<IORedisInstrumentationConfig> {
  constructor(config: IORedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, { ...DEFAULT_CONFIG, ...config });
  }

  override setConfig(config: IORedisInstrumentationConfig = {}) {
    super.setConfig({ ...DEFAULT_CONFIG, ...config });
  }

  init(): InstrumentationNodeModuleDefinition[] {
    return [
      new InstrumentationNodeModuleDefinition(
        'ioredis',
        ['>=2.0.0 <6'],
        (module, moduleVersion?: string) => {
          const moduleExports =
            module[Symbol.toStringTag] === 'Module'
              ? module.default // ESM
              : module; // CommonJS
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
          return module;
        },
        module => {
          if (module === undefined) return;
          const moduleExports =
            module[Symbol.toStringTag] === 'Module'
              ? module.default // ESM
              : module; // CommonJS
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
      return this._traceSendCommand(original, moduleVersion);
    };
  }

  private _patchConnection() {
    return (original: Function) => {
      return this._traceConnection(original);
    };
  }

  private _traceSendCommand(original: Function, moduleVersion?: string) {
    const instrumentation = this;
    return function (this: RedisInterface, cmd?: IORedisCommand) {
      if (arguments.length < 1 || typeof cmd !== 'object') {
        return original.apply(this, arguments);
      }
      const config = instrumentation.getConfig();
      const dbStatementSerializer =
        config.dbStatementSerializer || defaultDbStatementSerializer;

      const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
      if (config.requireParentSpan === true && hasNoParentSpan) {
        return original.apply(this, arguments);
      }

      const span = instrumentation.tracer.startSpan(cmd.name, {
        kind: SpanKind.CLIENT,
        attributes: {
          [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_REDIS,
          [SEMATTRS_DB_STATEMENT]: dbStatementSerializer(cmd.name, cmd.args),
        },
      });

      const { requestHook } = config;
      if (requestHook) {
        safeExecuteInTheMiddle(
          () =>
            requestHook(span, {
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
        [SEMATTRS_NET_PEER_NAME]: host,
        [SEMATTRS_NET_PEER_PORT]: port,
        [SEMATTRS_DB_CONNECTION_STRING]: `redis://${host}:${port}`,
      });

      try {
        const result = original.apply(this, arguments);

        const origResolve = cmd.resolve;
        /* eslint-disable @typescript-eslint/no-explicit-any */
        cmd.resolve = function (result: any) {
          safeExecuteInTheMiddle(
            () => config.responseHook?.(span, cmd.name, cmd.args, result),
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
      } catch (error: any) {
        endSpan(span, error);
        throw error;
      }
    };
  }

  private _traceConnection(original: Function) {
    const instrumentation = this;
    return function (this: RedisInterface) {
      const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
      if (
        instrumentation.getConfig().requireParentSpan === true &&
        hasNoParentSpan
      ) {
        return original.apply(this, arguments);
      }

      const span = instrumentation.tracer.startSpan('connect', {
        kind: SpanKind.CLIENT,
        attributes: {
          [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_REDIS,
          [SEMATTRS_DB_STATEMENT]: 'connect',
        },
      });
      const { host, port } = this.options;

      span.setAttributes({
        [SEMATTRS_NET_PEER_NAME]: host,
        [SEMATTRS_NET_PEER_PORT]: port,
        [SEMATTRS_DB_CONNECTION_STRING]: `redis://${host}:${port}`,
      });
      try {
        const client = original.apply(this, arguments);
        endSpan(span, null);
        return client;
      } catch (error: any) {
        endSpan(span, error);
        throw error;
      }
    };
  }
}
