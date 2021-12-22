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
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  context,
  diag,
  trace,
  Span,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import type * as mongoDBTypes from 'mongodb';
import { MongoDB4InstrumentationConfig, Connection } from './types';
import { VERSION } from './version';
import { CommandResult } from './types';

const supportedVersions = ['4.*'];

/** mongodb instrumentation plugin for OpenTelemetry */
export class MongoDB4Instrumentation extends InstrumentationBase<
  typeof mongoDBTypes
> {
  constructor(protected override _config: MongoDB4InstrumentationConfig = {}) {
    super('@opentelemetry/instrumentation-mongodb4', VERSION, _config);
  }

  init() {
    const { patch, unpatch } = this._getPatches();
    return [
      new InstrumentationNodeModuleDefinition<typeof mongoDBTypes>(
        'mongodb',
        supportedVersions,
        undefined,
        undefined,
        [
          new InstrumentationNodeModuleFile<Connection>(
            'mongodb/lib/cmap/connection.js',
            supportedVersions,
            patch,
            unpatch
          ),
        ]
      ),
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _getPatches<Connection>() {
    return {
      patch: (moduleExports: any, moduleVersion?: string) => {
        diag.debug(`Applying patch for mongodb@${moduleVersion}`);
        // patch insert operation
        if (isWrapped(moduleExports.Connection.prototype.command)) {
          this._unwrap(moduleExports, 'command');
        }

        this._wrap(
          moduleExports.Connection.prototype,
          'command',
          this._getPatchCommand()
        );
        return moduleExports;
      },
      unpatch: (moduleExports?: any, moduleVersion?: string) => {
        if (moduleExports === undefined) return;
        diag.debug(`Removing internal patch for mongodb@${moduleVersion}`);
        this._unwrap(moduleExports.Connection.prototype, 'command');
      },
    };
  }
  /** Creates spans for command operation */
  private _getPatchCommand() {
    const instrumentation = this;
    return (original: Connection['command']) => {
      return function patchedServerCommand(
        this: unknown,
        ns: mongoDBTypes.MongoDBNamespace,
        cmd: any,
        options: undefined | unknown,
        callback: mongoDBTypes.Callback<any>
      ) {
        const currentSpan = trace.getSpan(context.active());
        const resultHandler = callback;
        if (
          !currentSpan ||
          typeof resultHandler !== 'function' ||
          typeof cmd !== 'object' ||
          cmd.ismaster
        ) {
          return original.call(this, ns, cmd, options, callback);
        }
        const commandType = MongoDB4Instrumentation._getCommandType(cmd);
        const span = instrumentation.tracer.startSpan(
          `mongodb.${commandType}`,
          {
            kind: SpanKind.CLIENT,
          }
        );
        instrumentation._populateAttributes(this, span, ns, cmd);
        const patchedCallback = instrumentation._patchEnd(span, resultHandler);
        return original.call(
          this,
          ns,
          cmd,
          options,
          patchedCallback as mongoDBTypes.Callback
        );
      };
    };
  }
  /**
   * Get the mongodb command type from the object.
   * @param command Internal mongodb command object
   */
  private static _getCommandType(command: Document): string {
    return Object.keys(command)[0];
  }

  /**
   * Populate span's attributes by fetching related metadata from the context
   * @param ctx the Connection context
   * @param span span to add attributes to
   * @param ns mongodb namespace
   * @param command? mongodb internal representation of a command
   */
  private _populateAttributes(
    ctx: any,
    span: Span,
    ns: mongoDBTypes.MongoDBNamespace,
    command: any
  ) {
    if (ctx) {
      const hostParts =
        typeof ctx.address === 'string' ? ctx.address.split(':') : '';
      if (hostParts.length === 2) {
        span.setAttributes({
          [SemanticAttributes.NET_HOST_NAME]: hostParts[0],
          [SemanticAttributes.NET_HOST_PORT]: hostParts[1],
        });
      }

      // add database related attributes
      span.setAttributes({
        [SemanticAttributes.DB_SYSTEM]: 'mongodb',
        [SemanticAttributes.DB_NAME]: ns.db,
        [SemanticAttributes.DB_MONGODB_COLLECTION]: ns.collection,
      });
    }
    // capture parameters within the query as well if enhancedDatabaseReporting is enabled.
    let commandObj: Record<string, unknown>;
    if (command && command.documents) {
      commandObj = command.documents[0];
    } else {
      commandObj = command.cursors ?? command;
    }
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
    const config: MongoDB4InstrumentationConfig = this.getConfig();
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
        instrumentation._handleExecutionResult(span, args[1] as CommandResult);
      }
      span.end();

      return context.with(activeContext, () => {
        return resultHandler.apply(this, args);
      });
    };
  }
}
