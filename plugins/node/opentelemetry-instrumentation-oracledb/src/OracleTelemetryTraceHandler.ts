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
  ATTR_SERVER_PORT,
  ATTR_SERVER_ADDRESS,
  ATTR_NETWORK_TRANSPORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DB_SYSTEM,
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_STATEMENT,
  ATTR_DB_OPERATION_PARAMETER,
  ATTR_DB_USER,
} from './semconv';

import type * as oracleDBTypes from 'oracledb';
type TraceHandlerBaseCtor = new () => any;
const OUT_BIND = 3003; // bindinfo direction value.

// Local modules.
import { OracleInstrumentationConfig, SpanConnectionConfig } from './types';
import { TraceSpanData, SpanCallLevelConfig } from './internal-types';
import { SpanNames, DB_SYSTEM_VALUE_ORACLE } from './constants';

// It dynamically retrieves the TraceHandlerBase class from the oracledb module
// (if available) while avoiding direct imports that could cause issues if
// the module is missing.
function getTraceHandlerBaseClass(
  obj: typeof oracleDBTypes
): TraceHandlerBaseCtor | null {
  try {
    return (obj as any).traceHandler.TraceHandlerBase as TraceHandlerBaseCtor;
  } catch (err) {
    diag.error('Failed to load oracledb module.', err);
    return null;
  }
}

export function getOracleTelemetryTraceHandlerClass(
  obj: typeof oracleDBTypes
): any {
  const traceHandlerBase = getTraceHandlerBaseClass(obj);
  if (!traceHandlerBase) {
    return undefined;
  }

  /**
   * OracleTelemetryTraceHandler extends TraceHandlerBase from oracledb module
   * It implements the abstract methods; `onEnterFn`, `onExitFn`,
   * `onBeginRoundTrip` and `onEndRoundTrip` of TraceHandlerBase class.
   * Inside these overridden methods, the input traceContext data is used
   * to generate attributes for span.
   */
  class OracleTelemetryTraceHandler extends traceHandlerBase {
    private _getTracer: () => Tracer;
    private _instrumentConfig: OracleInstrumentationConfig;

    constructor(getTracer: () => Tracer, config: OracleInstrumentationConfig) {
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

    // It returns db.namespace as mentioned in semantic conventions
    // Ex: ORCL1|PDB1|db_high.adb.oraclecloud.com
    private _getDBNameSpace(
      instanceName?: string,
      pdbName?: string,
      serviceName?: string
    ): string | undefined {
      if (instanceName == null && pdbName == null && serviceName == null) {
        return undefined;
      }
      return `${instanceName ?? ''}|${pdbName ?? ''}|${serviceName ?? ''}`;
    }

    // Returns the connection related Attributes for
    // semantic standards and module custom keys.
    private _getConnectionSpanAttributes(config: SpanConnectionConfig) {
      return {
        [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_ORACLE,
        [ATTR_NETWORK_TRANSPORT]: config.protocol,
        [ATTR_DB_USER]: config.user,
        [ATTR_DB_NAMESPACE]: this._getDBNameSpace(
          config.instanceName,
          config.pdbName,
          config.serviceName
        ),
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

    // Transforms the bind values array or bindinfo into an object
    // 'db.operation.parameter'.
    // Ex:
    //   db.operation.parameter.0 = "someval" // for bind by position
    //   db.operation.parameter.name = "someval" // for bind by name
    // It is only called if config 'enhancedDatabaseReporting' is true.
    private _getValues(values: any) {
      if (!values) return undefined;
      const convertedValues: Record<string, string> = {};

      try {
        if (Array.isArray(values)) {
          // Handle indexed (positional) parameters
          values.forEach((value, index) => {
            const key = `${ATTR_DB_OPERATION_PARAMETER}.${index}`;
            const extractedValue = this._extractValue(value);
            if (extractedValue !== undefined) {
              convertedValues[key] = extractedValue;
            }
          });
        } else if (values && typeof values === 'object') {
          // Handle named parameters
          for (const [paramName, value] of Object.entries(values)) {
            const key = `${ATTR_DB_OPERATION_PARAMETER}.${paramName}`;
            let inVal: any = value;

            if (inVal && typeof inVal === 'object') {
              // Check bind info if present.
              if (inVal.dir === OUT_BIND) {
                // outbinds
                convertedValues[key] = '';
                continue;
              }
              if ('val' in inVal) {
                inVal = inVal.val;
              }
            }
            const extractedValue = this._extractValue(inVal);
            if (extractedValue !== undefined) {
              convertedValues[key] = extractedValue;
            }
          }
        }
      } catch (e) {
        diag.error('failed to stringify bind values:', values, e);
        return undefined;
      }
      return convertedValues;
    }

    private _extractValue(value: any): string | undefined {
      if (value == null) {
        return 'null';
      }
      if (value instanceof Buffer || this._isLobInstance(value)) {
        return value.toString();
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return value.toString();
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
          span.setAttribute(ATTR_DB_STATEMENT, callConfig.statement);
          if (this._instrumentConfig.enhancedDatabaseReporting && !roundTrip) {
            const values = this._getValues(callConfig.values);
            if (values) {
              span.setAttributes(values);
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

    // Updates the spanName following the format
    // {FunctionName:[sqlCommand] db.namespace}
    // Ex: 'oracledb.Pool.getConnection:[SELECT] ORCL1|PDB1|db_high.adb.oraclecloud.com'
    // This function is called when connectLevelConfig has required parameters populated.
    private _updateSpanName(traceContext: TraceSpanData) {
      const { connectLevelConfig, callLevelConfig, userContext, operation } =
        traceContext;
      if (
        ![
          SpanNames.EXECUTE,
          SpanNames.EXECUTE_MANY,
          SpanNames.EXECUTE_MSG,
        ].includes(operation as SpanNames)
      ) {
        // Ignore for connection establishment functions.
        return;
      }

      const { instanceName, pdbName, serviceName } = connectLevelConfig;
      const dbName = this._getDBNameSpace(instanceName, pdbName, serviceName);
      const sqlCommand =
        callLevelConfig?.statement?.split(' ')[0].toUpperCase() || '';
      userContext.span.updateName(
        `${operation}:${sqlCommand}${dbName && ` ${dbName}`}`
      );
    }

    // Updates the span with final traceContext attributes
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

      // Set if additional connection and call parameters
      // are available
      this._updateFinalSpanAttributes(traceContext, true);
      this._updateSpanName(traceContext);
      traceContext.userContext.span.end();
    }
  }
  return OracleTelemetryTraceHandler;
}
