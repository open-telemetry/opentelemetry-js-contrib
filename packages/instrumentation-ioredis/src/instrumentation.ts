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
  diag,
  trace,
  context,
  SpanKind,
  type Attributes,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  SemconvStability,
  semconvStabilityFromStr,
} from '@opentelemetry/instrumentation';
import { IORedisInstrumentationConfig } from './types';
import { IORedisCommand, RedisInterface } from './internal-types';
import {
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  DB_SYSTEM_VALUE_REDIS,
  DB_SYSTEM_NAME_VALUE_REDIS,
  ATTR_DB_CONNECTION_STRING,
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from './semconv';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { endSpan } from './utils';
import { defaultDbStatementSerializer } from '@opentelemetry/redis-common';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

const DEFAULT_CONFIG: IORedisInstrumentationConfig = {
  requireParentSpan: true,
};

export class IORedisInstrumentation extends InstrumentationBase<IORedisInstrumentationConfig> {
  private _netSemconvStability!: SemconvStability;
  private _dbSemconvStability!: SemconvStability;

  constructor(config: IORedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, { ...DEFAULT_CONFIG, ...config });
    this._setSemconvStabilityFromEnv();
  }

  // Used for testing.
  private _setSemconvStabilityFromEnv() {
    this._netSemconvStability = semconvStabilityFromStr(
      'http',
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN
    );
    this._dbSemconvStability = semconvStabilityFromStr(
      'database',
      process.env.OTEL_SEMCONV_STABILITY_OPT_IN
    );
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

      const attributes: Attributes = {};

      let operationName = cmd.name;
      const command = cmd as any;

      /**
       * ioredis sets metadata differently for MULTI/EXEC vs pipelines:
       * - MULTI/EXEC: queued commands have inTransaction = true; pipelineIndex tracks order in the transaction.
       * - Pipeline: commands have inTransaction = false; pipelineIndex increments per command (0, 1, 2…).
       *
       * Control commands ('multi'/'exec') are not prefixed.
       * These flags are used to prefix operation names so spans reflect transactional or pipelined commands.
       * Older ioredis versions (<=4.12.x) do not support prefixed operation names for multi/pipeline commands.
       */
      if (
        command.inTransaction &&
        cmd.name !== 'multi' &&
        cmd.name !== 'exec'
      ) {
        operationName = `MULTI ${cmd.name}`;
      } else if (
        command.pipelineIndex != null &&
        cmd.name !== 'multi' &&
        cmd.name !== 'exec'
      ) {
        operationName = `PIPELINE ${cmd.name}`;
      }

      if (instrumentation._dbSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_DB_OPERATION_NAME] = operationName;
      }

      const { host, port } = this.options;

      const dbQueryText = dbStatementSerializer(cmd.name, cmd.args);
      if (instrumentation._dbSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_DB_SYSTEM] = DB_SYSTEM_VALUE_REDIS;
        attributes[ATTR_DB_STATEMENT] = dbQueryText;
        attributes[ATTR_DB_CONNECTION_STRING] = `redis://${host}:${port}`;
      }
      if (instrumentation._dbSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_REDIS;
        attributes[ATTR_DB_QUERY_TEXT] = dbQueryText;
      }
      if (instrumentation._netSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_NET_PEER_NAME] = host;
        attributes[ATTR_NET_PEER_PORT] = port;
      }
      if (instrumentation._netSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_SERVER_ADDRESS] = host;
        attributes[ATTR_SERVER_PORT] = port;
      }
      const span = instrumentation.tracer.startSpan(cmd.name, {
        kind: SpanKind.CLIENT,
        attributes,
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

      const attributes: Attributes = {};
      const { host, port } = this.options;
      if (instrumentation._dbSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_DB_SYSTEM] = DB_SYSTEM_VALUE_REDIS;
        attributes[ATTR_DB_STATEMENT] = 'connect';
        attributes[ATTR_DB_CONNECTION_STRING] = `redis://${host}:${port}`;
      }
      if (instrumentation._dbSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_DB_SYSTEM_NAME] = DB_SYSTEM_NAME_VALUE_REDIS;
        attributes[ATTR_DB_QUERY_TEXT] = 'connect';
      }
      if (instrumentation._netSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_NET_PEER_NAME] = host;
        attributes[ATTR_NET_PEER_PORT] = port;
      }
      if (instrumentation._netSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_SERVER_ADDRESS] = host;
        attributes[ATTR_SERVER_PORT] = port;
      }
      const span = instrumentation.tracer.startSpan('connect', {
        kind: SpanKind.CLIENT,
        attributes,
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
