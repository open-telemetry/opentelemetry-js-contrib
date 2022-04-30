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
  Span,
  SpanStatusCode,
} from '@opentelemetry/api';
import {
  isWrapped,
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { defaultDbStatementSerializer } from './utils';
import { RedisInstrumentationConfig } from './types';
import { VERSION } from './version';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';

const OTEL_OPEN_SPANS = Symbol(
  'opentelemetry.instruemntation.redis.open_spans'
);
const MULTI_COMMAND_OPTIONS = Symbol(
  'opentelemetry.instruemntation.redis.multi_command_options'
);

interface MutliCommandInfo {
  span: Span;
  commandName: string;
  commandArgs: Array<string | Buffer>;
}

const DEFAULT_CONFIG: RedisInstrumentationConfig = {
  requireParentSpan: false,
};

export class RedisInstrumentation extends InstrumentationBase<any> {
  static readonly COMPONENT = 'redis';

  constructor(protected override _config: RedisInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-redis', VERSION, _config);
  }

  override setConfig(config: RedisInstrumentationConfig = {}) {
    this._config = Object.assign({}, DEFAULT_CONFIG, config);
  }

  protected init() {
    return [
      // @node-redis/client is a new package introduced and consumed by 'redis ^4.0.0'
      new InstrumentationNodeModuleDefinition<unknown>(
        '@node-redis/client',
        ['^1.0.0'],
        (moduleExports: any, moduleVersion?: string) => {
          diag.debug(
            `Patching @node-redis/client@${moduleVersion} (redis@^4.x.x)`
          );
          return moduleExports;
        },
        (_moduleExports: any, moduleVersion?: string) => {
          diag.debug(
            `Unpatching @node-redis/client@${moduleVersion} (redis@^4.x.x)`
          );
        },
        [
          new InstrumentationNodeModuleFile<any>(
            '@node-redis/client/dist/lib/commander.js',
            ['^1.0.0'],
            (moduleExports: any) => {
              const transformCommandArguments =
                moduleExports.transformCommandArguments;
              if (!transformCommandArguments) {
                this._diag.error(
                  'internal instrumentation error, missing transformCommandArguments function'
                );
                return moduleExports;
              }

              // this is the function that extend a redis client with a list of commands.
              // the function patches the commandExecutor to record a span
              this._diag.debug('Patching redis commands executor');
              if (isWrapped(moduleExports?.extendWithCommands)) {
                this._unwrap(moduleExports, 'extendWithCommands');
              }
              this._wrap(
                moduleExports,
                'extendWithCommands',
                this._getPatchExtendWithCommands(transformCommandArguments)
              );

              return moduleExports;
            },
            (moduleExports: any) => {
              this._diag.debug('Unpatching redis commands executor');
              if (isWrapped(moduleExports?.extendWithCommands)) {
                this._unwrap(moduleExports, 'extendWithCommands');
              }
            }
          ),
          new InstrumentationNodeModuleFile<any>(
            '@node-redis/client/dist/lib/client/multi-command.js',
            ['^1.0.0'],
            (moduleExports: any) => {
              this._diag.debug('Patching redis multi commands executor');
              const redisClientMultiCommandPrototype =
                moduleExports?.default?.prototype;
              if (isWrapped(redisClientMultiCommandPrototype?.exec)) {
                this._unwrap(redisClientMultiCommandPrototype, 'exec');
              }
              this._wrap(
                redisClientMultiCommandPrototype,
                'exec',
                this._getPatchMultiCommandsExec()
              );

              return moduleExports;
            },
            (moduleExports: any) => {
              this._diag.debug('Unpatching redis multi commands executor');
              const redisClientMultiCommandPrototype =
                moduleExports?.default?.prototype;
              if (isWrapped(redisClientMultiCommandPrototype?.exec)) {
                this._unwrap(redisClientMultiCommandPrototype, 'exec');
              }
            }
          ),
          new InstrumentationNodeModuleFile<any>(
            '@node-redis/client/dist/lib/client/index.js',
            ['^1.0.0'],
            (moduleExports: any) => {
              this._diag.debug('Patching redis client');
              const redisClientPrototype = moduleExports?.default?.prototype;

              if (isWrapped(redisClientPrototype?.multi)) {
                this._unwrap(redisClientPrototype, 'multi');
              }
              this._wrap(
                redisClientPrototype,
                'multi',
                this._getPatchRedisClientMulti()
              );

              return moduleExports;
            },
            (moduleExports: any) => {
              this._diag.debug('Unpatching redis client');
              const redisClientPrototype = moduleExports?.default?.prototype;
              if (isWrapped(redisClientPrototype?.multi)) {
                this._unwrap(redisClientPrototype, 'multi');
              }
            }
          ),
        ]
      ),
    ];
  }

  private _getPatchExtendWithCommands(transformCommandArguments: Function) {
    const plugin = this;
    return function extendWithCommandsPatchWrapper(original: Function) {
      return function extendWithCommandsPatch(this: any, config: any) {
        const origExecutor = config.executor;
        config.executor = function (
          this: any,
          command: any,
          args: Array<string | Buffer>
        ) {
          const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
          if (hasNoParentSpan && plugin._config?.requireParentSpan) {
            return origExecutor.apply(this, arguments);
          }

          const redisCommandArguments = transformCommandArguments(
            command,
            args
          ).args;
          const clientOptions = this.options || this[MULTI_COMMAND_OPTIONS];

          const commandName = redisCommandArguments[0] as string; // types also allows it to be a Buffer, but in practice it only string
          const commandArgs = redisCommandArguments.slice(1);

          const dbStatementSerializer =
            plugin._config?.dbStatementSerializer ||
            defaultDbStatementSerializer;

          const attributes = {
            [SemanticAttributes.DB_SYSTEM]: DbSystemValues.REDIS,
            [SemanticAttributes.NET_PEER_NAME]: clientOptions?.socket?.host,
            [SemanticAttributes.NET_PEER_PORT]: clientOptions?.socket?.port,
            [SemanticAttributes.DB_CONNECTION_STRING]: clientOptions?.url,
          };

          try {
            const dbStatement = dbStatementSerializer(commandName, commandArgs);
            if (dbStatement != null) {
              attributes[SemanticAttributes.DB_STATEMENT] = dbStatement;
            }
          } catch (e) {
            plugin._diag.error('dbStatementSerializer throw an exception', e);
          }

          const span = plugin.tracer.startSpan(
            `${RedisInstrumentation.COMPONENT}-${commandName}`,
            {
              kind: SpanKind.CLIENT,
              attributes,
            }
          );

          const res = origExecutor.apply(this, arguments);
          if (typeof(res?.then) === 'function') {
            res.then(
              (redisRes: unknown) => {
                plugin._endSpanWithResponse(
                  span,
                  commandName,
                  commandArgs,
                  redisRes,
                  undefined
                );
              },
              (err: any) => {
                plugin._endSpanWithResponse(
                  span,
                  commandName,
                  commandArgs,
                  null,
                  err
                );
              }
            );
          } else {
            const redisClientMultiCommand = res as {
              [OTEL_OPEN_SPANS]?: Array<MutliCommandInfo>;
            };
            redisClientMultiCommand[OTEL_OPEN_SPANS] =
              redisClientMultiCommand[OTEL_OPEN_SPANS] || [];
            redisClientMultiCommand[OTEL_OPEN_SPANS]!.push({
              span,
              commandName,
              commandArgs,
            });
          }
          return res;
        };
        return original.apply(this, arguments);
      };
    };
  }

  private _getPatchMultiCommandsExec() {
    const plugin = this;
    return function execPatchWrapper(original: Function) {
      return function execPatch(this: any) {
        const execRes = original.apply(this, arguments);
        if (typeof execRes?.then !== 'function') {
          this._diag.error(
            'got non promise result when patching RedisClientMultiCommand.exec'
          );
          return execRes;
        }

        execRes.then((redisRes: unknown[]) => {
          const openSpans = this[OTEL_OPEN_SPANS];
          if (!openSpans) {
            return this._diag.error(
              'cannot find open spans to end for redis multi command'
            );
          }
          if (redisRes.length !== openSpans.length) {
            return this._diag.error(
              'number of multi command spans does not match response from redis'
            );
          }
          for (let i = 0; i < openSpans.length; i++) {
            const { span, commandName, commandArgs } = openSpans[i];
            const currCommandRes = redisRes[i];
            if (currCommandRes instanceof Error) {
              plugin._endSpanWithResponse(
                span,
                commandName,
                commandArgs,
                null,
                currCommandRes
              );
            } else {
              plugin._endSpanWithResponse(
                span,
                commandName,
                commandArgs,
                currCommandRes,
                undefined
              );
            }
          }
        });
        return execRes;
      };
    };
  }

  private _getPatchRedisClientMulti() {
    return function multiPatchWrapper(original: Function) {
      return function multiPatch(this: any) {
        const multiRes = original.apply(this, arguments);
        multiRes[MULTI_COMMAND_OPTIONS] = this.options;
        return multiRes;
      };
    };
  }

  private _endSpanWithResponse(
    span: Span,
    commandName: string,
    commandArgs: string[],
    response: unknown,
    error: Error | undefined
  ) {
    if (!error && this._config.responseHook) {
      try {
        this._config.responseHook(span, commandName, commandArgs, response);
      } catch (err) {
        this._diag.error('responseHook throw an exception', err);
      }
    }
    if (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
    }
    span.end();
  }
}
