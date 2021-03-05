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
  getSpan,
  SpanStatusCode,
  Span,
  context,
  diag,
  SpanKind,
} from '@opentelemetry/api';
import type * as mongodb from 'mongodb';
import {
  MongodbCommandType,
  MongoInternalCommand,
  MongoInternalTopology,
  WireProtocolInternal,
  MongoDbInstrumentationConfig,
  CursorState,
} from './types';
import { VERSION } from './version';
import {
  DatabaseAttribute,
  GeneralAttribute,
} from '@opentelemetry/semantic-conventions';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
} from '@opentelemetry/instrumentation';

const supportedVersions = ['>=3.3 <4'];

/** mongodb instrumentation plugin for OpenTelemetry */
export class MongoDBInstrumentation extends InstrumentationBase<
  typeof mongodb
> {
  constructor(protected _config: MongoDbInstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-mongodb', VERSION, _config);
  }

  init() {
    const { patch, unpatch } = this._getPatches();
    return [
      new InstrumentationNodeModuleDefinition<typeof mongodb>(
        'mongodb',
        supportedVersions,
        undefined,
        undefined,
        [
          new InstrumentationNodeModuleFile<WireProtocolInternal>(
            'mongodb/lib/core/wireprotocol/index.js',
            supportedVersions,
            patch,
            unpatch
          ),
        ]
      ),
    ];
  }

  private _getPatches<T extends WireProtocolInternal>() {
    return {
      patch: (moduleExports: T, moduleVersion?: string) => {
        diag.debug(`Applying patch for mongodb@${moduleVersion}`);
        // patch insert operation
        if (isWrapped(moduleExports.insert)) {
          this._unwrap(moduleExports, 'insert');
        }
        this._wrap(moduleExports, 'insert', this._getPatchOperation('insert'));
        // patch remove operation
        if (isWrapped(moduleExports.remove)) {
          this._unwrap(moduleExports, 'remove');
        }
        this._wrap(moduleExports, 'remove', this._getPatchOperation('remove'));
        // patch update operation
        if (isWrapped(moduleExports.update)) {
          this._unwrap(moduleExports, 'update');
        }
        this._wrap(moduleExports, 'update', this._getPatchOperation('update'));
        // patch other command
        if (isWrapped(moduleExports.command)) {
          this._unwrap(moduleExports, 'command');
        }
        this._wrap(moduleExports, 'command', this._getPatchCommand());
        // patch query
        if (isWrapped(moduleExports.query)) {
          this._unwrap(moduleExports, 'query');
        }
        this._wrap(moduleExports, 'query', this._getPatchFind());
        // patch get more operation on cursor
        if (isWrapped(moduleExports.getMore)) {
          this._unwrap(moduleExports, 'getMore');
        }
        this._wrap(moduleExports, 'getMore', this._getPatchCursor());
        return moduleExports;
      },
      unpatch: (moduleExports?: T, moduleVersion?: string) => {
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

  /** Creates spans for common operations */
  private _getPatchOperation(operationName: 'insert' | 'update' | 'remove') {
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
        const currentSpan = getSpan(context.active());
        const resultHandler =
          typeof options === 'function' ? options : callback;
        if (
          !currentSpan ||
          typeof resultHandler !== 'function' ||
          typeof ops !== 'object'
        ) {
          return original.call(
            this,
            server,
            ns,
            ops,
            typeof options === 'function' ? callback : options,
            callback
          );
        }
        const span = instrumentation.tracer.startSpan(
          `mongodb.${operationName}`,
          {
            kind: SpanKind.CLIENT,
          }
        );
        instrumentation._populateAttributes(
          span,
          ns,
          server,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          operationName !== 'insert' ? (ops[0] as any) : undefined
        );
        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        return original.call(
          this,
          server,
          ns,
          ops,
          typeof options === 'function' ? patchedCallback : options,
          patchedCallback
        );
      };
    };
  }

  /** Creates spans for command operation */
  private _getPatchCommand() {
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
        const currentSpan = getSpan(context.active());
        const resultHandler =
          typeof options === 'function' ? options : callback;
        if (
          !currentSpan ||
          typeof resultHandler !== 'function' ||
          typeof cmd !== 'object'
        ) {
          return original.call(
            this,
            server,
            ns,
            cmd,
            typeof options === 'function' ? callback : options,
            callback
          );
        }
        const commandType = instrumentation._getCommandType(cmd);
        const type =
          commandType === MongodbCommandType.UNKNOWN ? 'command' : commandType;
        const span = instrumentation.tracer.startSpan(`mongodb.${type}`, {
          kind: SpanKind.CLIENT,
        });
        instrumentation._populateAttributes(span, ns, server, cmd);
        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        return original.call(
          this,
          server,
          ns,
          cmd,
          typeof options === 'function' ? patchedCallback : options,
          patchedCallback
        );
      };
    };
  }

  /** Creates spans for find operation */
  private _getPatchFind() {
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
        const currentSpan = getSpan(context.active());
        const resultHandler =
          typeof options === 'function' ? options : callback;
        if (
          !currentSpan ||
          typeof resultHandler !== 'function' ||
          typeof cmd !== 'object'
        ) {
          return original.call(
            this,
            server,
            ns,
            cmd,
            cursorState,
            typeof options === 'function' ? callback : options,
            callback
          );
        }
        const span = instrumentation.tracer.startSpan('mongodb.find', {
          kind: SpanKind.CLIENT,
        });
        instrumentation._populateAttributes(span, ns, server, cmd);
        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        return original.call(
          this,
          server,
          ns,
          cmd,
          cursorState,
          typeof options === 'function' ? patchedCallback : options,
          patchedCallback
        );
      };
    };
  }

  /** Creates spans for find operation */
  private _getPatchCursor() {
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
        const currentSpan = getSpan(context.active());
        const resultHandler =
          typeof options === 'function' ? options : callback;
        if (!currentSpan || typeof resultHandler !== 'function') {
          return original.call(
            this,
            server,
            ns,
            cursorState,
            batchSize,
            typeof options === 'function' ? callback : options,
            callback
          );
        }
        const span = instrumentation.tracer.startSpan('mongodb.getMore', {
          kind: SpanKind.CLIENT,
        });
        instrumentation._populateAttributes(span, ns, server, cursorState.cmd);
        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        return original.call(
          this,
          server,
          ns,
          cursorState,
          batchSize,
          typeof options === 'function' ? patchedCallback : options,
          patchedCallback
        );
      };
    };
  }

  /**
   * Get the mongodb command type from the object.
   * @param command Internal mongodb command object
   */
  private _getCommandType(command: MongoInternalCommand): MongodbCommandType {
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
   * @param ns mongodb namespace
   * @param command mongodb internal representation of a command
   * @param topology mongodb internal representation of the network topology
   */
  private _populateAttributes(
    span: Span,
    ns: string,
    topology: MongoInternalTopology,
    command?: MongoInternalCommand
  ) {
    // add network attributes to determine the remote server
    if (topology && topology.s) {
      span.setAttributes({
        [GeneralAttribute.NET_HOST_NAME]: `${
          topology.s.options?.host ?? topology.s.host
        }`,
        [GeneralAttribute.NET_HOST_PORT]: `${
          topology.s.options?.port ?? topology.s.port
        }`,
      });
    }

    // The namespace is a combination of the database name and the name of the
    // collection or index, like so: [database-name].[collection-or-index-name].
    // It could be a string or an instance of MongoDBNamespace, as such we
    // always coerce to a string to extract db and collection.
    const [dbName, dbCollection] = ns.toString().split('.');

    // add database related attributes
    span.setAttributes({
      [DatabaseAttribute.DB_SYSTEM]: 'mongodb',
      [DatabaseAttribute.DB_NAME]: dbName,
      [DatabaseAttribute.DB_MONGODB_COLLECTION]: dbCollection,
    });

    if (command === undefined) return;

    // capture parameters within the query as well if enhancedDatabaseReporting is enabled.
    const commandObj = command.query ?? command.q ?? command;
    const query =
      this._config?.enhancedDatabaseReporting === true
        ? commandObj
        : Object.keys(commandObj).reduce((obj, key) => {
            obj[key] = '?';
            return obj;
          }, {} as { [key: string]: unknown });

    span.setAttribute(DatabaseAttribute.DB_STATEMENT, JSON.stringify(query));
  }

  /**
   * Ends a created span.
   * @param span The created span to end.
   * @param resultHandler A callback function.
   */
  private _patchEnd(span: Span, resultHandler: Function): Function {
    return function patchedEnd(this: {}, ...args: unknown[]) {
      const error = args[0];
      if (error instanceof Error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
      }
      span.end();
      return resultHandler.apply(this, args);
    };
  }
}
