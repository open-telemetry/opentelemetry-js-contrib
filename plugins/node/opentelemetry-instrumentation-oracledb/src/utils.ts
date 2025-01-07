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
 * Copyright (c) 2024, Oracle and/or its affiliates.
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
import { AttributeNames } from './constants';
import {
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_NAME,
  SEMATTRS_DB_CONNECTION_STRING,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
  SEMATTRS_NET_TRANSPORT,
  SEMATTRS_DB_USER,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_OPERATION,
  DBSYSTEMVALUES_ORACLE,
} from '@opentelemetry/semantic-conventions';
import * as oracledbTypes from 'oracledb';
import { OracleInstrumentationConfig, SpanConnectionConfig } from './types';
import { TraceSpanData, SpanCallLevelConfig } from './internal-types';
import { SpanNames } from './constants';

const newmoduleExports: any = oracledbTypes;

/**
 * OracleTelemetryTraceHandler extends TraceHandlerBase from oracledb module
 * It implements the abstract methods; `onEnterFn`, `onExitFn`, `onBeginRoundTrip`
 * and `onEndRoundTrip` of TraceHandlerBase class.
 * Inside these overriden methods, the input traceContext data is used
 * to generate attributes for span.
 */
export class OracleTelemetryTraceHandler extends newmoduleExports.traceHandler
  .TraceHandlerBase {
  private _tracer: Tracer;
  private _instrumentConfig: OracleInstrumentationConfig;

  constructor(tracer: Tracer, config: OracleInstrumentationConfig) {
    super();
    this._tracer = tracer;
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
      [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_ORACLE,
      [SEMATTRS_NET_TRANSPORT]: config.protocol,
      [SEMATTRS_DB_USER]: config.user,
      [AttributeNames.ORACLE_INSTANCE]: config.instanceName,
      [AttributeNames.ORACLE_PDBNAME]: config.pdbName,
      [AttributeNames.ORACLE_POOL_MIN]: config.poolMin,
      [AttributeNames.ORACLE_POOL_MAX]: config.poolMax,
      [AttributeNames.ORACLE_POOL_INCR]: config.poolIncrement,
      [SEMATTRS_DB_NAME]: config.serviceName,
      [SEMATTRS_DB_CONNECTION_STRING]: config.connectString,
      [SEMATTRS_NET_PEER_NAME]: config.hostName,
      [SEMATTRS_NET_PEER_PORT]: config.port,
    };
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
            value instanceof newmoduleExports.Lob
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
      diag.error('failed to stringify ', values, e);
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
        SEMATTRS_DB_OPERATION,
        // retrieve just the first word
        callConfig.statement.split(' ')[0].toUpperCase()
      );
      if (
        this._instrumentConfig.dbStatementDump ||
        this._instrumentConfig.enhancedDatabaseReporting
      ) {
        span.setAttribute(SEMATTRS_DB_STATEMENT, callConfig.statement);
        if (this._instrumentConfig.enhancedDatabaseReporting && !roundTrip) {
          const values = this._getValues(callConfig.values);
          if (values) {
            span.setAttribute(AttributeNames.ORACLE_BIND_VALUES, values);
          }
        }
      }
    }
  }

  private _handleExecuteCustomRequest(span: Span, traceContext: TraceSpanData) {
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

  private _handleExecuteCustomResult(span: Span, traceContext: TraceSpanData) {
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

  // Updates the span with final traceContext atributes
  // which are updated after the exported function call.
  // roundTrip flag will skip dumping bind values for
  // internal roundtrip spans generated for exported functions.
  private _updateFinalSpanAttributes(
    traceContext: TraceSpanData,
    roundTrip = false
  ) {
    const span = traceContext.userContext.span;
    // Set if addtional connection and call parameters
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
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: traceContext.error?.message,
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
    let spanAttrs = {};
    if (traceContext.connectLevelConfig) {
      spanAttrs = this._getConnectionSpanAttributes(
        traceContext.connectLevelConfig
      );
    }

    traceContext.userContext = {
      span: this._tracer.startSpan(spanName, {
        kind: SpanKind.CLIENT,
        attributes: spanAttrs,
      }),
    };

    if (traceContext.fn) {
      // wrap the active span context to the exported function.
      traceContext.fn = context.bind(
        trace.setSpan(context.active(), traceContext.userContext.span),
        traceContext.fn
      );
    }

    switch (traceContext.operation) {
      case SpanNames.EXECUTE:
        this._handleExecuteCustomRequest(
          traceContext.userContext.span,
          traceContext
        );
        break;
      default:
        break;
    }
  }

  // This method is invoked after exported function from oracledb module
  // completes.
  onExitFn(traceContext: TraceSpanData) {
    if (
      this._shouldSkipInstrumentation() ||
      !traceContext.userContext ||
      !traceContext.userContext.span
    ) {
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
      span: this._tracer.startSpan(spanName, {
        kind: SpanKind.CLIENT,
        attributes: spanAttrs,
      }),
    };
  }

  // This method is invoked after a round trip call to DB is done
  // from the oracledb module as part of sql execution.
  onEndRoundTrip(traceContext: TraceSpanData) {
    if (
      this._shouldSkipInstrumentation() ||
      !traceContext.userContext ||
      !traceContext.userContext.span
    ) {
      return;
    }

    // Set if addtional connection and call parameters
    // are available
    this._updateFinalSpanAttributes(traceContext, true);
    traceContext.userContext.span.end();
  }
}
