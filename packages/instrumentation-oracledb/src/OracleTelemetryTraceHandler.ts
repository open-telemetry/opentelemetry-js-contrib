/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2025, 2026, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import {
  type Span,
  SpanStatusCode,
  type Tracer,
  context,
  SpanKind,
  trace,
  diag,
  TraceFlags,
  type SpanContext,
  type Attributes,
  type HrTime,
} from '@opentelemetry/api';
import {
  ATTR_DB_NAMESPACE,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_DB_OPERATION_NAME,
  ATTR_SERVER_PORT,
  ATTR_SERVER_ADDRESS,
  ATTR_NETWORK_TRANSPORT,
  ATTR_ERROR_TYPE,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DB_OPERATION_PARAMETER,
  ATTR_ORACLE_DB_DOMAIN,
  ATTR_ORACLE_DB_INSTANCE_NAME,
  ATTR_ORACLE_DB_NAME,
  ATTR_ORACLE_DB_PDB,
  ATTR_ORACLE_DB_SERVICE,
  DB_SYSTEM_NAME_VALUE_ORACLE_DB,
} from './semconv';
import { hrTime } from '@opentelemetry/core';

import type * as oracleDBTypes from 'oracledb';
type TraceHandlerBaseCtor = new () => any;
const OUT_BIND = 3003; // bindinfo direction value.

// Local modules.
import type {
  OracleInstrumentationConfig,
  SpanConnectionConfig,
} from './types';
import type { TraceSpanData, SpanCallLevelConfig } from './internal-types';
import * as metricsUtils from './metricUtils';
import { SpanNames } from './constants';

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

// Parses the database operation name used for metrics attributes.
// PLSQL blocks are reported as `PLSQL` or `BATCH PLSQL`; other operations are
// prepended with `BATCH` when executed through `executeMany()`.
function parseMetricOperationName(
  statement: string | undefined,
  isBatch: boolean
): string {
  if (!statement || typeof statement !== 'string') return 'UNKNOWN';

  const operationName = parseNormalizedOperationName(statement);

  if (operationName === 'BEGIN' || operationName === 'DECLARE') {
    return isBatch ? 'BATCH PLSQL' : 'PLSQL';
  }

  return isBatch ? `BATCH ${operationName}` : operationName;
}

function parseNormalizedOperationName(statement: string): string {
  const trimmed = statement.trim();
  let end = trimmed.length;
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    // Checks for space (32), tab (9), LF (10), VT (11), FF (12), CR (13)
    if (code === 32 || (code >= 9 && code <= 13)) {
      end = i;
      break;
    }
  }
  const sqlCommand = trimmed.slice(0, end).toUpperCase();
  return sqlCommand.endsWith(';') ? sqlCommand.slice(0, -1) : sqlCommand;
}

export function buildTraceparent(spanContext: SpanContext): string | undefined {
  return `00-${spanContext.traceId}-${spanContext.spanId}-0${Number(
    spanContext.traceFlags || TraceFlags.NONE
  ).toString(16)}`;
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
   * `onBeginRoundTrip`, `onEndRoundTrip` and pool event hooks like `onPoolAcquire`,
   * `onPoolRelease`, `onPoolWait`, etc. of TraceHandlerBase class.
   * Inside these overridden methods, the input traceContext data is used
   * to generate attributes for spans and metrics.
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

    // Returns the connection related Attributes for
    // semantic standards and module custom keys.
    private _getConnectionSpanAttributes(config: SpanConnectionConfig) {
      const attributes: Record<string, string | number | undefined> = {
        [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_ORACLE_DB,
        [ATTR_NETWORK_TRANSPORT]: config.protocol,
        [ATTR_SERVER_ADDRESS]: config.hostName,
        [ATTR_SERVER_PORT]: config.port,
      };

      if (config.dbUniqueName) {
        attributes[ATTR_DB_NAMESPACE] = config.dbUniqueName;
      }
      if (config.dbName) {
        attributes[ATTR_ORACLE_DB_NAME] = config.dbName;
      }
      if (config.domainName) {
        attributes[ATTR_ORACLE_DB_DOMAIN] = config.domainName;
      }
      if (config.pdbName) {
        attributes[ATTR_ORACLE_DB_PDB] = config.pdbName;
      }
      if (config.instanceName) {
        attributes[ATTR_ORACLE_DB_INSTANCE_NAME] = config.instanceName;
      }
      if (config.serviceName) {
        attributes[ATTR_ORACLE_DB_SERVICE] = config.serviceName;
      }

      return attributes;
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
            const extractedValue = this._extractValue(value);
            if (extractedValue !== undefined) {
              convertedValues[ATTR_DB_OPERATION_PARAMETER(`${index}`)] =
                extractedValue;
            }
          });
        } else if (values && typeof values === 'object') {
          // Handle named parameters
          for (const [paramName, value] of Object.entries(values)) {
            const key = ATTR_DB_OPERATION_PARAMETER(paramName);
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
          parseNormalizedOperationName(callConfig.statement)
        );
        if (
          this._instrumentConfig.dbStatementDump ||
          this._instrumentConfig.enhancedDatabaseReporting
        ) {
          span.setAttribute(ATTR_DB_QUERY_TEXT, callConfig.statement);
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

      // Some older node-oracledb versions do not populate
      // callLevelConfig.statement for executeMany round trips,
      // so fall back to the original SQL argument.
      const sqlStatement =
        callLevelConfig?.statement ??
        (typeof traceContext.args?.[0] === 'string'
          ? traceContext.args[0]
          : undefined);
      const dbName = connectLevelConfig.dbUniqueName;
      // Prefer the SQL text for the verb. When the trace payload omits the
      // statement, the fallback above uses the original SQL argument.
      const sqlCommand = sqlStatement
        ? parseNormalizedOperationName(sqlStatement)
        : '';
      userContext.span.updateName(
        `${operation}:${sqlCommand}${dbName ? ` ${dbName}` : ''}`
      );
    }

    /**
     * Updates the span with final traceContext attributes which are updated
     * after the exported function call.
     *
     * @param traceContext - Context containing span instance, connection configs, and execution status/errors.
     * @param roundTrip - Optional flag. When true, skips recording bind values for internal round-trip spans generated for exported functions.
     * @returns The attribute map used for recording database client operation duration metrics.
     */
    private _updateFinalSpanAttributes(
      traceContext: TraceSpanData,
      roundTrip = false
    ) {
      const span = traceContext.userContext.span;
      // Set if additional connection and call parameters
      // are available
      const connAttrs: Attributes = traceContext.connectLevelConfig
        ? this._getConnectionSpanAttributes(traceContext.connectLevelConfig)
        : {};
      span.setAttributes(connAttrs);

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

      // Builds the attribute set used for execute duration metrics.
      const isBatch = traceContext.operation === SpanNames.EXECUTE_MANY;
      const metricsAttributes: Attributes = {
        [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_ORACLE_DB,
        [ATTR_DB_NAMESPACE]: connAttrs[ATTR_DB_NAMESPACE],
        [ATTR_SERVER_PORT]: connAttrs[ATTR_SERVER_PORT],
        [ATTR_SERVER_ADDRESS]: connAttrs[ATTR_SERVER_ADDRESS],
        [ATTR_DB_OPERATION_NAME]: parseMetricOperationName(
          traceContext.callLevelConfig?.statement,
          isBatch
        ),
      };

      if (traceContext.error) {
        const errorCode = traceContext.error.code;
        if (errorCode !== undefined) {
          metricsAttributes[ATTR_ERROR_TYPE] = String(errorCode);
        }
      }

      return metricsAttributes;
    }

    private _recordExecuteDuration(
      attributes: Attributes,
      startExecTime: HrTime | undefined
    ) {
      if (startExecTime === undefined) return;
      metricsUtils.recordOperationDuration(attributes, startExecTime);
    }

    private _updatePool(pool: oracleDBTypes.Pool) {
      metricsUtils.updateCounter(pool);
    }

    setInstrumentConfig(config: OracleInstrumentationConfig = {}) {
      this._instrumentConfig = config;
    }

    // This method is invoked before calling an exported function
    // from oracledb module. It also stores the time when the span is started.
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
        startTime: hrTime(),
      };

      if (traceContext.fn) {
        if (
          this._instrumentConfig.propagateTraceContextToSessionAction &&
          (traceContext.operation === SpanNames.EXECUTE ||
            traceContext.operation === SpanNames.EXECUTE_MANY)
        ) {
          const connection = traceContext.additionalConfig?.self;
          const traceparent = buildTraceparent(
            traceContext.userContext.span.spanContext()
          );
          if (connection && 'action' in connection && traceparent) {
            try {
              connection.action = traceparent;
            } catch (err) {
              diag.debug(
                'Failed to set connection.action for trace propagation',
                err
              );
            }
          }
        }

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
    onExitFn(traceContext: TraceSpanData): void {
      const userContext = traceContext.userContext;
      if (!userContext?.span) {
        return;
      }

      const { span, startTime } = userContext;
      const { operation } = traceContext;
      const metricAttributes = this._updateFinalSpanAttributes(traceContext);

      const isExecute = operation === SpanNames.EXECUTE;
      const isExecuteMany = operation === SpanNames.EXECUTE_MANY;

      if (isExecute || isExecuteMany) {
        this._recordExecuteDuration(metricAttributes, startTime);
      }

      switch (operation) {
        case SpanNames.EXECUTE:
          this._handleExecuteCustomResult(span, traceContext);
          break;
      }

      this._updateSpanName(traceContext);
      span.end();
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

    onPoolExpand(pool: oracleDBTypes.Pool) {
      this._updatePool(pool);
    }

    onPoolShrink(pool: oracleDBTypes.Pool) {
      this._updatePool(pool);
    }

    onPoolAcquire(pool: oracleDBTypes.Pool) {
      this._updatePool(pool);
    }

    onPoolRelease(pool: oracleDBTypes.Pool) {
      this._updatePool(pool);
    }

    onPoolWait(pool: oracleDBTypes.Pool) {
      this._updatePool(pool);
    }

    onPoolRequestTimeout(pool: oracleDBTypes.Pool) {
      this._updatePool(pool);
    }

    onPoolClose(pool: oracleDBTypes.Pool) {
      this._updatePool(pool);
    }
  }
  return OracleTelemetryTraceHandler;
}
