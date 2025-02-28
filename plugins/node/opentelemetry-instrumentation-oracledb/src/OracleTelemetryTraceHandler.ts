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
 *
 * Copyright (c) 2025, Oracle and/or its affiliates.
 * */
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import {
  Span,
  SpanStatusCode,
  Tracer,
  context,
  SpanKind,
  trace,
  diag,
} from '@opentelemetry/api';
import {
  SEMATTRS_DB_CONNECTION_STRING,
  ATTR_SERVER_PORT,
  ATTR_SERVER_ADDRESS,
  SEMATTRS_NET_TRANSPORT,
  SEMATTRS_DB_USER,
  SEMATTRS_DB_STATEMENT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DB_SYSTEM,
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
} from './semconv';

// Local modules.
import { AttributeNames } from './constants';
import { OracleInstrumentationConfig, SpanConnectionConfig } from './types';
import { TraceSpanData, SpanCallLevelConfig } from './internal-types';
import { SpanNames, DB_SYSTEM_VALUE_ORACLE } from './constants';

// extend oracledb module with traceHandler until type definations are
// available.
// see https://github.com/DefinitelyTyped/DefinitelyTyped/pull/72060/files
declare module 'oracledb' {
  /**
   * Type representing the trace context object.
   */
  type TraceContext = Record<string, any>;

  /**
   * Base class for handling tracing.
   */
  class TraceHandlerBase {
    constructor();

    /**
     * Checks if sending traces is enabled.
     */
    isEnabled(): boolean;

    /**
     * Enables sending traces.
     */
    enable(): void;

    /**
     * Disables sending traces.
     */
    disable(): void;

    /**
     * Called before invoking a public async method.
     * @param traceContext  input/output trace context object.
     */
    onEnterFn(traceContext?: TraceContext): void;

    /**
     * Called after invoking a public async method.
     * @param traceContext input/output trace context object.
     */
    onExitFn(traceContext?: TraceContext): void;

    /**
     * Called when a round trip is begun.
     * @param traceContext input/output trace context object.
     */
    onBeginRoundTrip(traceContext?: TraceContext): void;

    /**
     * Called when a round trip has ended.
     * @param traceContext input/output trace context object.
     */
    onEndRoundTrip(traceContext?: TraceContext): void;
  }

  interface traceHandler {
    TraceHandlerBase: typeof TraceHandlerBase;
  }

  const traceHandler: traceHandler;
}

// define a constructor type used by OracleTelemetryTraceHandler
// to extend the TraceHandlerBase class. This is needed
// to avoid importing values from oracledb and only import types.
interface TraceHandlerBaseConstructor {
  new (): traceHandler['TraceHandlerBase'];
}

import type { traceHandler } from 'oracledb'; // Import only for type checking

// It returns the TraceHandlerBase class, if oracledb module is available.
function getTraceHandlerBaseClass(): TraceHandlerBaseConstructor | null {
  try {
    // Use require() for CommonJS compatibility
    // dynamically loading the TraceHandlerBase class
    // from the oracledb module and casting it to
    // the TraceHandlerBaseConstructor type.
    return require('oracledb').traceHandler
      .TraceHandlerBase as TraceHandlerBaseConstructor;
  } catch (err) {
    diag.error('The required module oracledb installation failed. ', err);
    return null;
  }
}

export function getOracleTelemetryTraceHandlerClass(): any {
  const traceHandlerBase = getTraceHandlerBaseClass();
  if (traceHandlerBase) {
    /**
     * OracleTelemetryTraceHandler extends TraceHandlerBase from oracledb module
     * It implements the abstract methods; `onEnterFn`, `onExitFn`,
     * `onBeginRoundTrip` and `onEndRoundTrip` of TraceHandlerBase class.
     * Inside these overriden methods, the input traceContext data is used
     * to generate attributes for span.
     */
    class OracleTelemetryTraceHandler extends traceHandlerBase {
      private _getTracer: () => Tracer;
      private _instrumentConfig: OracleInstrumentationConfig;

      constructor(
        getTracer: () => Tracer,
        config: OracleInstrumentationConfig
      ) {
        super();
        this._getTracer = getTracer;
        this._instrumentConfig = config;
      }

      private _shouldSkipInstrumentation() {
        return (
          this._instrumentConfig.requireParentSpan === true &&
          trace.getSpan(context.active()) === undefined
        );
      }

      // Returns the connection related Attributes for
      // semantic standards and module custom keys.
      private _getConnectionSpanAttributes(config: SpanConnectionConfig) {
        return {
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_ORACLE,
          [SEMATTRS_NET_TRANSPORT]: config.protocol,
          [SEMATTRS_DB_USER]: config.user,
          [AttributeNames.ORACLE_INSTANCE]: config.instanceName,
          [AttributeNames.ORACLE_PDBNAME]: config.pdbName,
          [AttributeNames.ORACLE_POOL_MIN]: config.poolMin,
          [AttributeNames.ORACLE_POOL_MAX]: config.poolMax,
          [AttributeNames.ORACLE_POOL_INCR]: config.poolIncrement,
          [ATTR_DB_NAMESPACE]: config.serviceName,
          [SEMATTRS_DB_CONNECTION_STRING]: config.connectString,
          [ATTR_SERVER_ADDRESS]: config.hostName,
          [ATTR_SERVER_PORT]: config.port,
        };
      }

      // It returns true if object is of type oracledb.Lob.
      private _isLobInstance(obj: unknown): boolean {
        return (
          typeof obj === 'object' &&
          obj !== null &&
          Reflect.getPrototypeOf(obj)?.constructor?.name === 'Lob'
        );
      }

      // Transforms the bind values array into string values.
      // It is only called if config 'enhancedDatabaseReporting' is true.
      private _getValues(values: any) {
        let convertedValues;
        try {
          if (Array.isArray(values)) {
            // bind by position
            convertedValues = values.map(value => {
              if (value == null) {
                return 'null';
              } else if (
                value instanceof Buffer ||
                this._isLobInstance(value)
              ) {
                return value.toString();
              } else if (typeof value === 'object') {
                return JSON.stringify(value);
              } else {
                // number, string, boolean,
                return value.toString();
              }
            });
            return convertedValues;
          }
        } catch (e) {
          diag.error('failed to stringify bind values:', values, e);
        }
        return convertedValues;
      }

      // Updates the call level attributes in span.
      // roundTrip flag will skip dumping bind values for
      // internal roundtrip spans generated for oracledb exported functions.
      private _setCallLevelAttributes(
        span: Span,
        callConfig?: SpanCallLevelConfig,
        roundTrip = false
      ) {
        if (!callConfig) return;

        if (callConfig.statement) {
          span.setAttribute(
            ATTR_DB_OPERATION_NAME,
            // retrieve just the first word
            callConfig.statement.split(' ')[0].toUpperCase()
          );
          if (
            this._instrumentConfig.dbStatementDump ||
            this._instrumentConfig.enhancedDatabaseReporting
          ) {
            span.setAttribute(SEMATTRS_DB_STATEMENT, callConfig.statement);
            if (
              this._instrumentConfig.enhancedDatabaseReporting &&
              !roundTrip
            ) {
              const values = this._getValues(callConfig.values);
              if (values) {
                span.setAttribute(AttributeNames.ORACLE_BIND_VALUES, values);
              }
            }
          }
        }
      }

      private _handleExecuteCustomRequest(
        span: Span,
        traceContext: TraceSpanData
      ) {
        if (typeof this._instrumentConfig.requestHook === 'function') {
          safeExecuteInTheMiddle(
            () => {
              this._instrumentConfig.requestHook?.(span, {
                connection: traceContext.connectLevelConfig,
                inputArgs: traceContext.additionalConfig.args,
              });
            },
            err => {
              if (err) {
                diag.error('Error running request hook', err);
              }
            },
            true
          );
        }
      }

      private _handleExecuteCustomResult(
        span: Span,
        traceContext: TraceSpanData
      ) {
        if (typeof this._instrumentConfig.responseHook === 'function') {
          safeExecuteInTheMiddle(
            () => {
              this._instrumentConfig.responseHook?.(span, {
                data: traceContext.additionalConfig.result,
              });
            },
            err => {
              if (err) {
                diag.error('Error running query hook', err);
              }
            },
            true
          );
        }
      }

      // Updates the spanName with suffix, serviceName seperated by delimiter, space
      // Ex: 'oracledb.Pool.getConnection freepdb'
      // This function is called when connectLevelConfig has serviceName populated.
      private _updateSpanName(traceContext: TraceSpanData) {
        const dbName = traceContext.connectLevelConfig?.serviceName ?? '';
        traceContext.userContext.span.updateName(
          `${traceContext.operation}${dbName ? ` ${dbName}` : ''}`
        );
      }

      // Updates the span with final traceContext atributes
      // which are updated after the exported function call.
      // roundTrip flag will skip dumping bind values for
      // internal roundtrip spans generated for exported functions.
      private _updateFinalSpanAttributes(
        traceContext: TraceSpanData,
        roundTrip = false
      ) {
        const span = traceContext.userContext.span;
        // Set if additional connection and call parameters
        // are available
        if (traceContext.connectLevelConfig) {
          span.setAttributes(
            this._getConnectionSpanAttributes(traceContext.connectLevelConfig)
          );
        }
        if (traceContext.callLevelConfig) {
          this._setCallLevelAttributes(
            span,
            traceContext.callLevelConfig,
            roundTrip
          );
        }
        if (traceContext.additionalConfig.implicitRelease) {
          span.setAttribute(
            AttributeNames.ORACLE_IMPLICIT_RELEASE,
            traceContext.additionalConfig.implicitRelease
          );
        }
        if (traceContext.error) {
          span.recordException(traceContext.error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: traceContext.error.message,
          });
        }
      }

      setInstrumentConfig(config: OracleInstrumentationConfig = {}) {
        this._instrumentConfig = config;
      }

      // This method is invoked before calling an exported function
      // from oracledb module.
      onEnterFn(traceContext: TraceSpanData) {
        if (this._shouldSkipInstrumentation()) {
          return;
        }

        const spanName = traceContext.operation;
        const spanAttributes = traceContext.connectLevelConfig
          ? this._getConnectionSpanAttributes(traceContext.connectLevelConfig)
          : {};

        traceContext.userContext = {
          span: this._getTracer().startSpan(spanName, {
            kind: SpanKind.CLIENT,
            attributes: spanAttributes,
          }),
        };

        if (traceContext.fn) {
          // wrap the active span context to the exported function.
          traceContext.fn = context.bind(
            trace.setSpan(context.active(), traceContext.userContext.span),
            traceContext.fn
          );
        }

        if (traceContext.operation === SpanNames.EXECUTE) {
          this._handleExecuteCustomRequest(
            traceContext.userContext.span,
            traceContext
          );
        }
      }

      // This method is invoked after exported function from oracledb module
      // completes.
      onExitFn(traceContext: TraceSpanData) {
        if (!traceContext.userContext?.span) {
          return;
        }
        this._updateFinalSpanAttributes(traceContext);
        switch (traceContext.operation) {
          case SpanNames.EXECUTE:
            this._handleExecuteCustomResult(
              traceContext.userContext.span,
              traceContext
            );
            break;
          default:
            break;
        }
        this._updateSpanName(traceContext);
        traceContext.userContext.span.end();
      }

      // This method is invoked before a round trip call to DB is done
      // from the oracledb module as part of sql execution.
      onBeginRoundTrip(traceContext: TraceSpanData) {
        if (this._shouldSkipInstrumentation()) {
          return;
        }
        const spanName = traceContext.operation;
        const spanAttrs = {};
        traceContext.userContext = {
          span: this._getTracer().startSpan(spanName, {
            kind: SpanKind.CLIENT,
            attributes: spanAttrs,
          }),
        };
      }

      // This method is invoked after a round trip call to DB is done
      // from the oracledb module as part of sql execution.
      onEndRoundTrip(traceContext: TraceSpanData) {
        if (!traceContext.userContext?.span) {
          return;
        }

        // Set if addtional connection and call parameters
        // are available
        this._updateFinalSpanAttributes(traceContext, true);
        this._updateSpanName(traceContext);
        traceContext.userContext.span.end();
      }
    }
    return OracleTelemetryTraceHandler;
  }
}
