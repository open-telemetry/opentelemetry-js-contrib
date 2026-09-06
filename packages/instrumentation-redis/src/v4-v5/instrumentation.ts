/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
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
import { getClientAttributes } from './utils';
import { defaultDbStatementSerializer } from '@opentelemetry/redis-common';
import { RedisInstrumentationConfig } from '../types';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from '../version';
import {
  ATTR_DB_OPERATION_BATCH_SIZE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
} from '@opentelemetry/semantic-conventions';
import type { MultiErrorReply } from './internal-types';

const OTEL_OPEN_SPANS = Symbol(
  'opentelemetry.instrumentation.redis.open_spans'
);
const MULTI_COMMAND_OPTIONS = Symbol(
  'opentelemetry.instrumentation.redis.multi_command_options'
);
const AGGREGATE_MULTI_COMMAND_SPANS = Symbol(
  'opentelemetry.instrumentation.redis.aggregate_multi_command_spans'
);
const MULTI_COMMANDS = Symbol(
  'opentelemetry.instrumentation.redis.multi_commands'
);

interface MultiCommand {
  commandName: string;
  commandArgs: Array<string | Buffer>;
}

interface MultiCommandInfo extends MultiCommand {
  span: Span;
}

export class RedisInstrumentationV4_V5 extends InstrumentationBase<RedisInstrumentationConfig> {
  static readonly COMPONENT = 'redis';

  constructor(config: RedisInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  override setConfig(config: RedisInstrumentationConfig = {}) {
    super.setConfig(config);
  }

  protected init() {
    // @node-redis/client is a new package introduced and consumed by 'redis 4.0.x'
    // on redis@4.1.0 it was changed to @redis/client.
    // we will instrument both packages
    return [
      this._getInstrumentationNodeModuleDefinition('@redis/client'),
      this._getInstrumentationNodeModuleDefinition('@node-redis/client'),
    ];
  }

  private _getInstrumentationNodeModuleDefinition(
    basePackageName: string
  ): InstrumentationNodeModuleDefinition {
    const commanderModuleFile = new InstrumentationNodeModuleFile(
      `${basePackageName}/dist/lib/commander.js`,
      ['^1.0.0'],
      (moduleExports: any, moduleVersion?: string) => {
        const transformCommandArguments =
          moduleExports.transformCommandArguments;
        if (!transformCommandArguments) {
          this._diag.error(
            'internal instrumentation error, missing transformCommandArguments function'
          );
          return moduleExports;
        }

        // function name and signature changed in redis 4.1.0 from 'extendWithCommands' to 'attachCommands'
        // the matching internal package names starts with 1.0.x (for redis 4.0.x)
        const functionToPatch = moduleVersion?.startsWith('1.0.')
          ? 'extendWithCommands'
          : 'attachCommands';
        // this is the function that extend a redis client with a list of commands.
        // the function patches the commandExecutor to record a span
        if (isWrapped(moduleExports?.[functionToPatch])) {
          this._unwrap(moduleExports, functionToPatch);
        }
        this._wrap(
          moduleExports,
          functionToPatch,
          this._getPatchExtendWithCommands(transformCommandArguments)
        );

        return moduleExports;
      },
      (moduleExports: any) => {
        if (isWrapped(moduleExports?.extendWithCommands)) {
          this._unwrap(moduleExports, 'extendWithCommands');
        }
        if (isWrapped(moduleExports?.attachCommands)) {
          this._unwrap(moduleExports, 'attachCommands');
        }
      }
    );

    const multiCommanderModule = new InstrumentationNodeModuleFile(
      `${basePackageName}/dist/lib/client/multi-command.js`,
      ['^1.0.0', '^5.0.0', '^6.0.0'],
      (moduleExports: any) => {
        const redisClientMultiCommandPrototype =
          moduleExports?.default?.prototype;

        if (isWrapped(redisClientMultiCommandPrototype?.exec)) {
          this._unwrap(redisClientMultiCommandPrototype, 'exec');
        }
        this._wrap(
          redisClientMultiCommandPrototype,
          'exec',
          this._getPatchMultiCommandsExec(false)
        );
        if (isWrapped(redisClientMultiCommandPrototype?.execAsPipeline)) {
          this._unwrap(redisClientMultiCommandPrototype, 'execAsPipeline');
        }
        this._wrap(
          redisClientMultiCommandPrototype,
          'execAsPipeline',
          this._getPatchMultiCommandsExec(true)
        );

        if (isWrapped(redisClientMultiCommandPrototype?.addCommand)) {
          this._unwrap(redisClientMultiCommandPrototype, 'addCommand');
        }
        this._wrap(
          redisClientMultiCommandPrototype,
          'addCommand',
          this._getPatchMultiCommandsAddCommand()
        );

        return moduleExports;
      },
      (moduleExports: any) => {
        const redisClientMultiCommandPrototype =
          moduleExports?.default?.prototype;
        if (isWrapped(redisClientMultiCommandPrototype?.exec)) {
          this._unwrap(redisClientMultiCommandPrototype, 'exec');
        }
        if (isWrapped(redisClientMultiCommandPrototype?.addCommand)) {
          this._unwrap(redisClientMultiCommandPrototype, 'addCommand');
        }
      }
    );

    const clientIndexModule = new InstrumentationNodeModuleFile(
      `${basePackageName}/dist/lib/client/index.js`,
      ['^1.0.0', '^5.0.0', '^6.0.0'],
      (moduleExports: any) => {
        const redisClientPrototype = moduleExports?.default?.prototype;

        // In some @redis/client versions 'multi' is a method. In later
        // versions, as of https://github.com/redis/node-redis/pull/2324,
        // 'MULTI' is a method and 'multi' is a property defined in the
        // constructor that points to 'MULTI', and therefore it will not
        // be defined on the prototype.
        if (redisClientPrototype?.multi) {
          if (isWrapped(redisClientPrototype?.multi)) {
            this._unwrap(redisClientPrototype, 'multi');
          }
          this._wrap(
            redisClientPrototype,
            'multi',
            this._getPatchRedisClientMulti()
          );
        }
        if (redisClientPrototype?.MULTI) {
          if (isWrapped(redisClientPrototype?.MULTI)) {
            this._unwrap(redisClientPrototype, 'MULTI');
          }
          this._wrap(
            redisClientPrototype,
            'MULTI',
            this._getPatchRedisClientMulti()
          );
        }

        if (isWrapped(redisClientPrototype?.sendCommand)) {
          this._unwrap(redisClientPrototype, 'sendCommand');
        }
        this._wrap(
          redisClientPrototype,
          'sendCommand',
          this._getPatchRedisClientSendCommand()
        );

        this._wrap(
          redisClientPrototype,
          'connect',
          this._getPatchedClientConnect()
        );

        return moduleExports;
      },
      (moduleExports: any) => {
        const redisClientPrototype = moduleExports?.default?.prototype;
        if (isWrapped(redisClientPrototype?.multi)) {
          this._unwrap(redisClientPrototype, 'multi');
        }
        if (isWrapped(redisClientPrototype?.MULTI)) {
          this._unwrap(redisClientPrototype, 'MULTI');
        }
        if (isWrapped(redisClientPrototype?.sendCommand)) {
          this._unwrap(redisClientPrototype, 'sendCommand');
        }
      }
    );

    const clusterIndexModule = new InstrumentationNodeModuleFile(
      `${basePackageName}/dist/lib/cluster/index.js`,
      ['^1.0.0', '^5.0.0', '^6.0.0'],
      (moduleExports: any) => {
        const redisClusterPrototype = moduleExports?.default?.prototype;

        // Patch MULTI to store cluster options on the multi command object
        // so that _traceClientCommand can read connection attributes later
        if (redisClusterPrototype?.MULTI) {
          if (isWrapped(redisClusterPrototype?.MULTI)) {
            this._unwrap(redisClusterPrototype, 'MULTI');
          }
          this._wrap(
            redisClusterPrototype,
            'MULTI',
            this._getPatchRedisClusterMulti()
          );
        }

        return moduleExports;
      },
      (moduleExports: any) => {
        const redisClusterPrototype = moduleExports?.default?.prototype;
        if (isWrapped(redisClusterPrototype?.MULTI)) {
          this._unwrap(redisClusterPrototype, 'MULTI');
        }
      }
    );

    const clusterMultiCommanderModule = new InstrumentationNodeModuleFile(
      `${basePackageName}/dist/lib/cluster/multi-command.js`,
      ['^1.0.0', '^5.0.0', '^6.0.0'],
      (moduleExports: any) => {
        const redisClusterMultiCommandPrototype =
          moduleExports?.default?.prototype;

        if (isWrapped(redisClusterMultiCommandPrototype?.exec)) {
          this._unwrap(redisClusterMultiCommandPrototype, 'exec');
        }
        this._wrap(
          redisClusterMultiCommandPrototype,
          'exec',
          this._getPatchMultiCommandsExec(false)
        );

        if (isWrapped(redisClusterMultiCommandPrototype?.addCommand)) {
          this._unwrap(redisClusterMultiCommandPrototype, 'addCommand');
        }
        this._wrap(
          redisClusterMultiCommandPrototype,
          'addCommand',
          this._getPatchClusterMultiCommandsAddCommand()
        );

        return moduleExports;
      },
      (moduleExports: any) => {
        const redisClusterMultiCommandPrototype =
          moduleExports?.default?.prototype;
        if (isWrapped(redisClusterMultiCommandPrototype?.exec)) {
          this._unwrap(redisClusterMultiCommandPrototype, 'exec');
        }
        if (isWrapped(redisClusterMultiCommandPrototype?.addCommand)) {
          this._unwrap(redisClusterMultiCommandPrototype, 'addCommand');
        }
      }
    );

    return new InstrumentationNodeModuleDefinition(
      basePackageName,
      ['^1.0.0', '^5.0.0', '^6.0.0'],
      (moduleExports: any) => {
        return moduleExports;
      },
      () => {},
      [
        commanderModuleFile,
        multiCommanderModule,
        clientIndexModule,
        clusterIndexModule,
        clusterMultiCommanderModule,
      ]
    );
  }

  // serves both for redis 4.0.x where function name is extendWithCommands
  // and redis ^4.1.0 where function name is attachCommands
  private _getPatchExtendWithCommands(transformCommandArguments: Function) {
    const plugin = this;
    return function extendWithCommandsPatchWrapper(original: Function) {
      return function extendWithCommandsPatch(this: any, config: any) {
        if (config?.BaseClass?.name !== 'RedisClient') {
          return original.apply(this, arguments);
        }

        const origExecutor = config.executor;
        config.executor = function (
          this: any,
          command: any,
          args: Array<string | Buffer>
        ) {
          const redisCommandArguments = transformCommandArguments(
            command,
            args
          ).args;
          return plugin._traceClientCommand(
            origExecutor,
            this,
            arguments,
            redisCommandArguments
          );
        };
        return original.apply(this, arguments);
      };
    };
  }

  private _getPatchMultiCommandsExec(isPipeline: boolean) {
    const plugin = this;
    return function execPatchWrapper(original: Function) {
      return function execPatch(this: any) {
        if (this[AGGREGATE_MULTI_COMMAND_SPANS]) {
          return plugin._traceMultiCommand(
            original,
            this,
            arguments,
            isPipeline
          );
        }

        const execRes = original.apply(this, arguments);
        if (typeof execRes?.then !== 'function') {
          plugin._diag.error(
            'non-promise result when patching exec/execAsPipeline'
          );
          return execRes;
        }

        return execRes
          .then((redisRes: unknown[]) => {
            const openSpans = this[OTEL_OPEN_SPANS];
            plugin._endSpansWithRedisReplies(openSpans, redisRes, isPipeline);
            return redisRes;
          })
          .catch((err: Error) => {
            const openSpans = this[OTEL_OPEN_SPANS];
            if (!openSpans) {
              plugin._diag.error(
                'cannot find open spans to end for multi/pipeline'
              );
            } else {
              const replies =
                err.constructor.name === 'MultiErrorReply'
                  ? (err as MultiErrorReply).replies
                  : new Array(openSpans.length).fill(err);
              plugin._endSpansWithRedisReplies(openSpans, replies, isPipeline);
            }
            return Promise.reject(err);
          });
      };
    };
  }

  private _getPatchMultiCommandsAddCommand() {
    const plugin = this;
    return function addCommandWrapper(original: Function) {
      return function addCommandPatch(this: any, args: Array<string | Buffer>) {
        return plugin._traceClientCommand(original, this, arguments, args);
      };
    };
  }

  private _getPatchClusterMultiCommandsAddCommand() {
    const plugin = this;
    return function addCommandWrapper(original: Function) {
      return function addCommandPatch(
        this: any,
        firstKeyOrArgs: any,
        isReadonly: any,
        args: Array<string | Buffer>
      ) {
        // Cluster addCommand is called in two ways:
        // 1. Internally by named commands: (firstKey, isReadonly, args, transformReply)
        // 2. Directly by user via .addCommand([...]): (args) - single array argument
        const redisArgs = Array.isArray(firstKeyOrArgs) ? firstKeyOrArgs : args;
        return plugin._traceClientCommand(original, this, arguments, redisArgs);
      };
    };
  }
  private _getPatchRedisClusterMulti() {
    const plugin = this;
    return function multiPatchWrapper(original: Function) {
      return function multiPatch(this: any) {
        const multiRes = original.apply(this, arguments);
        // Store cluster options so _traceClientCommand can read connection attributes
        multiRes[MULTI_COMMAND_OPTIONS] = this._options;
        multiRes[AGGREGATE_MULTI_COMMAND_SPANS] =
          plugin.getConfig().aggregateMultiCommandSpans;
        return multiRes;
      };
    };
  }

  private _getPatchRedisClientMulti() {
    const plugin = this;
    return function multiPatchWrapper(original: Function) {
      return function multiPatch(this: any) {
        const multiRes = original.apply(this, arguments);
        multiRes[MULTI_COMMAND_OPTIONS] = this.options;
        multiRes[AGGREGATE_MULTI_COMMAND_SPANS] =
          plugin.getConfig().aggregateMultiCommandSpans;
        return multiRes;
      };
    };
  }

  private _getPatchRedisClientSendCommand() {
    const plugin = this;
    return function sendCommandWrapper(original: Function) {
      return function sendCommandPatch(
        this: any,
        args: Array<string | Buffer>
      ) {
        return plugin._traceClientCommand(original, this, arguments, args);
      };
    };
  }

  private _getPatchedClientConnect() {
    const plugin = this;
    return function connectWrapper(original: Function) {
      return function patchedConnect(this: any): Promise<void> {
        const options = this.options;
        const attributes = getClientAttributes(options);

        const span = plugin.tracer.startSpan(
          `${RedisInstrumentationV4_V5.COMPONENT}-connect`,
          {
            kind: SpanKind.CLIENT,
            attributes,
          }
        );

        const res = context.with(trace.setSpan(context.active(), span), () => {
          return original.apply(this);
        });

        return res
          .then((result: unknown) => {
            span.end();
            return result;
          })
          .catch((error: Error) => {
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            span.end();
            return Promise.reject(error);
          });
      };
    };
  }

  private _traceClientCommand(
    origFunction: Function,
    origThis: any,
    origArguments: IArguments,
    redisCommandArguments: Array<string | Buffer>
  ) {
    if (origThis[AGGREGATE_MULTI_COMMAND_SPANS]) {
      const res = origFunction.apply(origThis, origArguments);
      res[MULTI_COMMANDS] = res[MULTI_COMMANDS] || [];
      res[MULTI_COMMANDS].push({
        commandName: redisCommandArguments[0].toString(),
        commandArgs: redisCommandArguments.slice(1),
      });
      return res;
    }

    const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
    if (hasNoParentSpan && this.getConfig().requireParentSpan) {
      return origFunction.apply(origThis, origArguments);
    }

    const clientOptions = origThis.options || origThis[MULTI_COMMAND_OPTIONS];

    const commandName = redisCommandArguments[0] as string; // types also allows it to be a Buffer, but in practice it only string
    const commandArgs = redisCommandArguments.slice(1);

    const dbStatementSerializer =
      this.getConfig().dbStatementSerializer || defaultDbStatementSerializer;

    const attributes = getClientAttributes(clientOptions);
    attributes[ATTR_DB_OPERATION_NAME] = commandName;
    try {
      const dbStatement = dbStatementSerializer(commandName, commandArgs);
      if (dbStatement != null) {
        attributes[ATTR_DB_QUERY_TEXT] = dbStatement;
      }
    } catch (e) {
      this._diag.error('dbStatementSerializer throw an exception', e, {
        commandName,
      });
    }

    const span = this.tracer.startSpan(
      `${RedisInstrumentationV4_V5.COMPONENT}-${commandName}`,
      {
        kind: SpanKind.CLIENT,
        attributes,
      }
    );

    const res = context.with(trace.setSpan(context.active(), span), () => {
      return origFunction.apply(origThis, origArguments);
    });
    if (typeof res?.then === 'function') {
      res.then(
        (redisRes: unknown) => {
          this._endSpanWithResponse(
            span,
            commandName,
            commandArgs,
            redisRes,
            undefined
          );
        },
        (err: any) => {
          this._endSpanWithResponse(span, commandName, commandArgs, null, err);
        }
      );
    } else {
      const redisClientMultiCommand = res as {
        [OTEL_OPEN_SPANS]?: Array<MultiCommandInfo>;
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
  }

  private _traceMultiCommand(
    origFunction: Function,
    origThis: any,
    origArguments: IArguments,
    isPipeline: boolean
  ) {
    const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
    if (hasNoParentSpan && this.getConfig().requireParentSpan) {
      return origFunction.apply(origThis, origArguments);
    }

    const commands: MultiCommand[] = origThis[MULTI_COMMANDS] || [];
    const operationName = this._getMultiOperationName(commands, isPipeline);
    const attributes = getClientAttributes(origThis[MULTI_COMMAND_OPTIONS]);
    attributes[ATTR_DB_OPERATION_NAME] = operationName;
    if (commands.length === 1) {
      const { commandName, commandArgs } = commands[0];
      const dbStatementSerializer =
        this.getConfig().dbStatementSerializer || defaultDbStatementSerializer;
      try {
        const dbStatement = dbStatementSerializer(commandName, commandArgs);
        if (dbStatement != null) {
          attributes[ATTR_DB_QUERY_TEXT] = dbStatement;
        }
      } catch (error) {
        this._diag.error('dbStatementSerializer throw an exception', error, {
          commandName,
        });
      }
    } else {
      attributes[ATTR_DB_OPERATION_BATCH_SIZE] = commands.length;
    }

    const span = this.tracer.startSpan(
      `${RedisInstrumentationV4_V5.COMPONENT}-${operationName}`,
      {
        kind: SpanKind.CLIENT,
        attributes,
      }
    );

    let execRes;
    try {
      execRes = context.with(trace.setSpan(context.active(), span), () =>
        origFunction.apply(origThis, origArguments)
      );
    } catch (error) {
      this._endMultiCommandSpan(span, commands, [], error as Error);
      throw error;
    }

    if (typeof execRes?.then !== 'function') {
      this._diag.error(
        'non-promise result when patching aggregate exec/execAsPipeline'
      );
      span.end();
      return execRes;
    }

    return execRes.then(
      (replies: unknown[]) => {
        this._endMultiCommandSpan(span, commands, replies);
        return replies;
      },
      (error: Error) => {
        const replies =
          error.constructor.name === 'MultiErrorReply'
            ? (error as MultiErrorReply).replies
            : [];
        this._endMultiCommandSpan(span, commands, replies, error);
        return Promise.reject(error);
      }
    );
  }

  private _getMultiOperationName(
    commands: MultiCommand[],
    isPipeline: boolean
  ): string {
    const batchName = isPipeline ? 'PIPELINE' : 'MULTI';
    if (commands.length === 0) {
      return batchName;
    }

    const firstCommand = commands[0].commandName;
    return commands.every(({ commandName }) => commandName === firstCommand)
      ? `${batchName} ${firstCommand}`
      : batchName;
  }

  private _endMultiCommandSpan(
    span: Span,
    commands: MultiCommand[],
    replies: unknown[],
    error?: Error
  ) {
    const { responseHook } = this.getConfig();
    for (let index = 0; index < commands.length; index++) {
      const reply = replies[index];
      if (reply instanceof Error) {
        span.recordException(reply);
        continue;
      }
      if (!responseHook || index >= replies.length) {
        continue;
      }

      try {
        const { commandName, commandArgs } = commands[index];
        responseHook(span, commandName, commandArgs, reply);
      } catch (hookError) {
        this._diag.error('responseHook throw an exception', hookError);
      }
    }

    const replyError = replies.find(reply => reply instanceof Error) as
      | Error
      | undefined;
    const spanError = error || replyError;
    if (spanError) {
      if (!replyError) {
        span.recordException(spanError);
      }
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: spanError.message,
      });
    }
    span.end();
  }

  private _endSpansWithRedisReplies(
    openSpans: Array<MultiCommandInfo>,
    replies: unknown[],
    isPipeline = false
  ) {
    if (!openSpans) {
      return this._diag.error(
        'cannot find open spans to end for redis multi/pipeline'
      );
    }
    if (replies.length !== openSpans.length) {
      return this._diag.error(
        'number of multi command spans does not match response from redis'
      );
    }
    // Determine a single operation name for the batch of commands.
    // If all commands are identical, include the command name (e.g., "MULTI SET").
    // Otherwise, use a generic "MULTI" or "PIPELINE" label for the span.
    const allCommands = openSpans.map(s => s.commandName);
    const allSameCommand = allCommands.every(cmd => cmd === allCommands[0]);
    const operationName = allSameCommand
      ? (isPipeline ? 'PIPELINE ' : 'MULTI ') + allCommands[0]
      : isPipeline
        ? 'PIPELINE'
        : 'MULTI';

    for (let i = 0; i < openSpans.length; i++) {
      const { span, commandArgs } = openSpans[i];
      const currCommandRes = replies[i];
      const [res, err] =
        currCommandRes instanceof Error
          ? [null, currCommandRes]
          : [currCommandRes, undefined];

      span.setAttribute(ATTR_DB_OPERATION_NAME, operationName);

      this._endSpanWithResponse(span, allCommands[i], commandArgs, res, err);
    }
  }

  private _endSpanWithResponse(
    span: Span,
    commandName: string,
    commandArgs: Array<string | Buffer>,
    response: unknown,
    error: Error | undefined
  ) {
    const { responseHook } = this.getConfig();
    if (!error && responseHook) {
      try {
        responseHook(span, commandName, commandArgs, response);
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
