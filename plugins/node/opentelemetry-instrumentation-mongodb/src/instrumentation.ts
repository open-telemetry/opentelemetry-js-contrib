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
  trace,
  Span,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import type * as mongodb from 'mongodb';
import {
  CursorState,
  MongodbCommandType,
  MongoDBInstrumentationConfig,
  MongoInternalCommand,
  MongoInternalTopology,
  WireProtocolInternal,
  CommandResult,
  V4Connection,
} from './types';
import { VERSION } from './version';

/** mongodb instrumentation plugin for OpenTelemetry */
export class MongoDBInstrumentation extends InstrumentationBase<
  typeof mongodb
> {
  constructor(protected override _config: MongoDBInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-mongodb', VERSION, _config);
  }

  init() {
    const { v3Patch, v3Unpatch } = this._getV3Patches();
    const { v4Patch, v4Unpatch } = this._getV4Patches();

    return [
      new InstrumentationNodeModuleDefinition<typeof mongodb>(
        'mongodb',
        ['>=3.3 <4'],
        undefined,
        undefined,
        [
          new InstrumentationNodeModuleFile<WireProtocolInternal>(
            'mongodb/lib/core/wireprotocol/index.js',
            ['>=3.3 <4'],
            v3Patch,
            v3Unpatch
          ),
        ]
      ),
      new InstrumentationNodeModuleDefinition<typeof mongodb>(
        'mongodb',
        ['4.*'],
        undefined,
        undefined,
        [
          new InstrumentationNodeModuleFile<V4Connection>(
            'mongodb/lib/cmap/connection.js',
            ['4.*'],
            v4Patch,
            v4Unpatch
          ),
        ]
      ),
    ];
  }

  private _getV3Patches<T extends WireProtocolInternal>() {
    return {
      v3Patch: (moduleExports: T, moduleVersion?: string) => {
        diag.debug(`Applying patch for mongodb@${moduleVersion}`);
        // patch insert operation
        if (isWrapped(moduleExports.insert)) {
          this._unwrap(moduleExports, 'insert');
        }
        this._wrap(
          moduleExports,
          'insert',
          this._getV3PatchOperation('insert')
        );
        // patch remove operation
        if (isWrapped(moduleExports.remove)) {
          this._unwrap(moduleExports, 'remove');
        }
        this._wrap(
          moduleExports,
          'remove',
          this._getV3PatchOperation('remove')
        );
        // patch update operation
        if (isWrapped(moduleExports.update)) {
          this._unwrap(moduleExports, 'update');
        }
        this._wrap(
          moduleExports,
          'update',
          this._getV3PatchOperation('update')
        );
        // patch other command
        if (isWrapped(moduleExports.command)) {
          this._unwrap(moduleExports, 'command');
        }
        this._wrap(moduleExports, 'command', this._getV3PatchCommand());
        // patch query
        if (isWrapped(moduleExports.query)) {
          this._unwrap(moduleExports, 'query');
        }
        this._wrap(moduleExports, 'query', this._getV3PatchFind());
        // patch get more operation on cursor
        if (isWrapped(moduleExports.getMore)) {
          this._unwrap(moduleExports, 'getMore');
        }
        this._wrap(moduleExports, 'getMore', this._getV3PatchCursor());
        return moduleExports;
      },
      v3Unpatch: (moduleExports?: T, moduleVersion?: string) => {
        if (moduleExports === undefined) return;
        diag.debug(`Removing internal patch for mongodb@${moduleVersion}`);
        this._unwrap(moduleExports, 'insert');
        this._unwrap(moduleExports, 'remove');
        this._unwrap(moduleExports, 'update');
        this._unwrap(moduleExports, 'command');
        this._unwrap(moduleExports, 'query');
        this._unwrap(moduleExports, 'getMore');
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _getV4Patches<T extends V4Connection>() {
    return {
      v4Patch: (moduleExports: any, moduleVersion?: string) => {
        diag.debug(`Applying patch for mongodb@${moduleVersion}`);
        // patch insert operation
        if (isWrapped(moduleExports.Connection.prototype.command)) {
          this._unwrap(moduleExports.Connection.prototype, 'command');
        }

        this._wrap(
          moduleExports.Connection.prototype,
          'command',
          this._getV4PatchCommand()
        );
        return moduleExports;
      },
      v4Unpatch: (moduleExports?: any, moduleVersion?: string) => {
        if (moduleExports === undefined) return;
        diag.debug(`Removing internal patch for mongodb@${moduleVersion}`);
        this._unwrap(moduleExports.Connection.prototype, 'command');
      },
    };
  }

  /** Creates spans for common operations */
  private _getV3PatchOperation(operationName: 'insert' | 'update' | 'remove') {
    const instrumentation = this;
    return (original: WireProtocolInternal[typeof operationName]) => {
      return function patchedServerCommand(
        this: unknown,
        server: MongoInternalTopology,
        ns: string,
        ops: unknown[],
        options: unknown | Function,
        callback?: Function
      ) {
        const currentSpan = trace.getSpan(context.active());
        const resultHandler =
          typeof options === 'function' ? options : callback;
        if (
          !currentSpan ||
          typeof resultHandler !== 'function' ||
          typeof ops !== 'object'
        ) {
          if (typeof options === 'function') {
            return original.call(this, server, ns, ops, options);
          } else {
            return original.call(this, server, ns, ops, options, callback);
          }
        }
        const span = instrumentation.tracer.startSpan(
          `mongodb.${operationName}`,
          {
            kind: SpanKind.CLIENT,
          }
        );

        instrumentation._populateV3Attributes(
          span,
          ns,
          server,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ops[0] as any
        );
        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        // handle when options is the callback to send the correct number of args
        if (typeof options === 'function') {
          return original.call(this, server, ns, ops, patchedCallback);
        } else {
          return original.call(this, server, ns, ops, options, patchedCallback);
        }
      };
    };
  }

  /** Creates spans for command operation */
  private _getV3PatchCommand() {
    const instrumentation = this;
    return (original: WireProtocolInternal['command']) => {
      return function patchedServerCommand(
        this: unknown,
        server: MongoInternalTopology,
        ns: string,
        cmd: MongoInternalCommand,
        options: unknown | Function,
        callback?: Function
      ) {
        const currentSpan = trace.getSpan(context.active());
        const resultHandler =
          typeof options === 'function' ? options : callback;
        if (
          !currentSpan ||
          typeof resultHandler !== 'function' ||
          typeof cmd !== 'object'
        ) {
          if (typeof options === 'function') {
            return original.call(this, server, ns, cmd, options);
          } else {
            return original.call(this, server, ns, cmd, options, callback);
          }
        }
        const commandType = MongoDBInstrumentation._getCommandType(cmd);
        const type =
          commandType === MongodbCommandType.UNKNOWN ? 'command' : commandType;
        const span = instrumentation.tracer.startSpan(`mongodb.${type}`, {
          kind: SpanKind.CLIENT,
        });
        instrumentation._populateV3Attributes(span, ns, server, cmd);
        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        // handle when options is the callback to send the correct number of args
        if (typeof options === 'function') {
          return original.call(this, server, ns, cmd, patchedCallback);
        } else {
          return original.call(this, server, ns, cmd, options, patchedCallback);
        }
      };
    };
  }

  /** Creates spans for command operation */
  private _getV4PatchCommand() {
    const instrumentation = this;
    return (original: V4Connection['command']) => {
      return function patchedV4ServerCommand(
        this: unknown,
        ns: any,
        cmd: any,
        options: undefined | unknown,
        callback: any
      ) {
        const currentSpan = trace.getSpan(context.active());
        const resultHandler = callback;
        if (
          !currentSpan ||
          typeof resultHandler !== 'function' ||
          typeof cmd !== 'object' ||
          cmd.ismaster ||
          cmd.hello
        ) {
          return original.call(this, ns, cmd, options, callback);
        }
        const commandType = Object.keys(cmd)[0];
        const span = instrumentation.tracer.startSpan(
          `mongodb.${commandType}`,
          {
            kind: SpanKind.CLIENT,
          }
        );
        instrumentation._populateV4Attributes(span, this, ns, cmd);
        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        return original.call(this, ns, cmd, options, patchedCallback);
      };
    };
  }

  /** Creates spans for find operation */
  private _getV3PatchFind() {
    const instrumentation = this;
    return (original: WireProtocolInternal['query']) => {
      return function patchedServerCommand(
        this: unknown,
        server: MongoInternalTopology,
        ns: string,
        cmd: MongoInternalCommand,
        cursorState: CursorState,
        options: unknown | Function,
        callback?: Function
      ) {
        const currentSpan = trace.getSpan(context.active());
        const resultHandler =
          typeof options === 'function' ? options : callback;
        if (
          !currentSpan ||
          typeof resultHandler !== 'function' ||
          typeof cmd !== 'object'
        ) {
          if (typeof options === 'function') {
            return original.call(this, server, ns, cmd, cursorState, options);
          } else {
            return original.call(
              this,
              server,
              ns,
              cmd,
              cursorState,
              options,
              callback
            );
          }
        }
        const span = instrumentation.tracer.startSpan('mongodb.find', {
          kind: SpanKind.CLIENT,
        });
        instrumentation._populateV3Attributes(span, ns, server, cmd);
        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        // handle when options is the callback to send the correct number of args
        if (typeof options === 'function') {
          return original.call(
            this,
            server,
            ns,
            cmd,
            cursorState,
            patchedCallback
          );
        } else {
          return original.call(
            this,
            server,
            ns,
            cmd,
            cursorState,
            options,
            patchedCallback
          );
        }
      };
    };
  }

  /** Creates spans for find operation */
  private _getV3PatchCursor() {
    const instrumentation = this;
    return (original: WireProtocolInternal['getMore']) => {
      return function patchedServerCommand(
        this: unknown,
        server: MongoInternalTopology,
        ns: string,
        cursorState: CursorState,
        batchSize: number,
        options: unknown | Function,
        callback?: Function
      ) {
        const currentSpan = trace.getSpan(context.active());
        const resultHandler =
          typeof options === 'function' ? options : callback;
        if (!currentSpan || typeof resultHandler !== 'function') {
          if (typeof options === 'function') {
            return original.call(
              this,
              server,
              ns,
              cursorState,
              batchSize,
              options
            );
          } else {
            return original.call(
              this,
              server,
              ns,
              cursorState,
              batchSize,
              options,
              callback
            );
          }
        }
        const span = instrumentation.tracer.startSpan('mongodb.getMore', {
          kind: SpanKind.CLIENT,
        });
        instrumentation._populateV3Attributes(
          span,
          ns,
          server,
          cursorState.cmd
        );
        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        // handle when options is the callback to send the correct number of args
        if (typeof options === 'function') {
          return original.call(
            this,
            server,
            ns,
            cursorState,
            batchSize,
            patchedCallback
          );
        } else {
          return original.call(
            this,
            server,
            ns,
            cursorState,
            batchSize,
            options,
            patchedCallback
          );
        }
      };
    };
  }

  /**
   * Get the mongodb command type from the object.
   * @param command Internal mongodb command object
   */
  private static _getCommandType(
    command: MongoInternalCommand
  ): MongodbCommandType {
    if (command.createIndexes !== undefined) {
      return MongodbCommandType.CREATE_INDEXES;
    } else if (command.findandmodify !== undefined) {
      return MongodbCommandType.FIND_AND_MODIFY;
    } else if (command.ismaster !== undefined) {
      return MongodbCommandType.IS_MASTER;
    } else if (command.count !== undefined) {
      return MongodbCommandType.COUNT;
    } else {
      return MongodbCommandType.UNKNOWN;
    }
  }

  /**
   * Populate span's attributes by fetching related metadata from the context
   * @param span span to add attributes to
   * @param connectionCtx mongodb internal connection context
   * @param ns mongodb namespace
   * @param command mongodb internal representation of a command
   */
  private _populateV4Attributes(
    span: Span,
    connectionCtx: any,
    ns: any,
    command?: any
  ) {
    let host, port: undefined | string;
    if (connectionCtx) {
      const hostParts =
        typeof connectionCtx.address === 'string'
          ? connectionCtx.address.split(':')
          : '';
      if (hostParts.length === 2) {
        host = hostParts[0];
        port = hostParts[1];
      }
    }
    // capture parameters within the query as well if enhancedDatabaseReporting is enabled.
    let commandObj: Record<string, unknown>;
    if (command?.documents && command.documents[0]) {
      commandObj = command.documents[0];
    } else if (command?.cursors) {
      commandObj = command.cursors;
    } else {
      commandObj = command;
    }

    this._addAllSpanAttributes(
      span,
      ns.db,
      ns.collection,
      host,
      port,
      commandObj
    );
  }

  /**
   * Populate span's attributes by fetching related metadata from the context
   * @param span span to add attributes to
   * @param ns mongodb namespace
   * @param topology mongodb internal representation of the network topology
   * @param command mongodb internal representation of a command
   */
  private _populateV3Attributes(
    span: Span,
    ns: string,
    topology: MongoInternalTopology,
    command?: MongoInternalCommand
  ) {
    // add network attributes to determine the remote server
    let host: undefined | string;
    let port: undefined | string;
    if (topology && topology.s) {
      host = topology.s.options?.host ?? topology.s.host;
      port = (topology.s.options?.port ?? topology.s.port)?.toString();
      if (host == null || port == null) {
        const address = topology.description?.address;
        if (address) {
          const addressSegments = address.split(':');
          host = addressSegments[0];
          port = addressSegments[1];
        }
      }
    }

    // The namespace is a combination of the database name and the name of the
    // collection or index, like so: [database-name].[collection-or-index-name].
    // It could be a string or an instance of MongoDBNamespace, as such we
    // always coerce to a string to extract db and collection.
    const [dbName, dbCollection] = ns.toString().split('.');
    // capture parameters within the query as well if enhancedDatabaseReporting is enabled.
    const commandObj = command?.query ?? command?.q ?? command;

    this._addAllSpanAttributes(
      span,
      dbName,
      dbCollection,
      host,
      port,
      commandObj
    );
  }

  private _addAllSpanAttributes(
    span: Span,
    dbName?: string,
    dbCollection?: string,
    host?: undefined | string,
    port?: undefined | string,
    commandObj?: any
  ) {
    // add database related attributes
    span.setAttributes({
      [SemanticAttributes.DB_SYSTEM]: DbSystemValues.MONGODB,
      [SemanticAttributes.DB_NAME]: dbName,
      [SemanticAttributes.DB_MONGODB_COLLECTION]: dbCollection,
    });

    if (host && port) {
      span.setAttributes({
        [SemanticAttributes.NET_HOST_NAME]: host,
        [SemanticAttributes.NET_HOST_PORT]: port,
      });
    }
    if (!commandObj) return;
    const dbStatementSerializer =
      typeof this._config.dbStatementSerializer === 'function'
        ? this._config.dbStatementSerializer
        : this._defaultDbStatementSerializer.bind(this);

    safeExecuteInTheMiddle(
      () => {
        const query = dbStatementSerializer(commandObj);
        span.setAttribute(SemanticAttributes.DB_STATEMENT, query);
      },
      err => {
        if (err) {
          this._diag.error('Error running dbStatementSerializer hook', err);
        }
      },
      true
    );
  }

  private _defaultDbStatementSerializer(commandObj: Record<string, unknown>) {
    const enhancedDbReporting = !!this._config?.enhancedDatabaseReporting;
    const resultObj = enhancedDbReporting
      ? commandObj
      : Object.keys(commandObj).reduce((obj, key) => {
          obj[key] = '?';
          return obj;
        }, {} as { [key: string]: unknown });
    return JSON.stringify(resultObj);
  }

  /**
   * Triggers the response hook in case it is defined.
   * @param span The span to add the results to.
   * @param result The command result
   */
  private _handleExecutionResult(span: Span, result: CommandResult) {
    const config: MongoDBInstrumentationConfig = this.getConfig();
    if (typeof config.responseHook === 'function') {
      safeExecuteInTheMiddle(
        () => {
          config.responseHook!(span, { data: result });
        },
        err => {
          if (err) {
            this._diag.error('Error running response hook', err);
          }
        },
        true
      );
    }
  }

  /**
   * Ends a created span.
   * @param span The created span to end.
   * @param resultHandler A callback function.
   */
  private _patchEnd(span: Span, resultHandler: Function): Function {
    // mongodb is using "tick" when calling a callback, this way the context
    // in final callback (resultHandler) is lost
    const activeContext = context.active();
    const instrumentation = this;
    return function patchedEnd(this: {}, ...args: unknown[]) {
      const error = args[0];
      if (error instanceof Error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
      } else {
        const result = args[1] as CommandResult;
        instrumentation._handleExecutionResult(span, result);
      }
      span.end();

      return context.with(activeContext, () => {
        return resultHandler.apply(this, args);
      });
    };
  }
}
