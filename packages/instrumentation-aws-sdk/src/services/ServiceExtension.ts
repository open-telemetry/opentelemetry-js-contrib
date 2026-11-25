/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Context,
  DiagLogger,
  HrTime,
  Meter,
  Span,
  SpanAttributes,
  SpanKind,
  Tracer,
} from '@opentelemetry/api';
import {
  AwsSdkInstrumentationConfig,
  NormalizedRequest,
  NormalizedResponse,
} from '../types';

/**
 * A span started and owned by a service extension, see {@link RequestMetadata.startSpan}.
 */
export interface ExtensionSpan {
  // context - the context the request runs in. It must contain the extension's span: the middleware
  // reads it with `trace.getSpan(context)` to record its own AWS attributes on it.
  context: Context;
  // end - complete the span successfully and end it. Called by the middleware after the response
  // hooks have run. Not called for a successful stream request: the extension then ends the span
  // itself once the stream is consumed.
  end: () => void;
  // fail - complete the span with an error (including its error status) and end it. Called by the
  // middleware when the request fails, after it recorded the exception and ran the user's exception hook.
  fail: (error: unknown) => void;
}

export interface RequestMetadata {
  // isIncoming - if true, then the operation callback / promise should be bind with the operation's span
  isIncoming: boolean;
  // isStream - if true, then the response is a stream so the span should not be ended by the middleware
  // when the request succeeds. The ServiceExtension must end the span itself, generally by wrapping the
  // stream and ending after it is consumed. The middleware still ends the span if the request fails.
  isStream?: boolean;
  spanAttributes?: SpanAttributes;
  spanKind?: SpanKind;
  spanName?: string;
  // startSpan - if set, the extension starts and owns the span instead of the middleware. It is called
  // with the instrumentation's tracer, the parent context, and the attributes the middleware would have
  // started its own span with (the extension should pass them as start attributes). The middleware runs
  // the request in the returned context, records its AWS attributes on the extension's span and passes
  // that span to the response and user hooks, but never sets its status or ends it: it calls `end` or
  // `fail` instead. If it returns `undefined` or throws, the middleware starts its own span from
  // `spanName`, `spanKind` and `spanAttributes` as usual.
  startSpan?: (
    tracer: Tracer,
    parentContext: Context,
    attributes: SpanAttributes
  ) => ExtensionSpan | undefined;
}

export interface ServiceExtension {
  // called before request is sent, and before span is started
  requestPreSpanHook: (
    request: NormalizedRequest,
    config: AwsSdkInstrumentationConfig,
    diag: DiagLogger
  ) => RequestMetadata;

  // called before request is sent, and after span is started
  requestPostSpanHook?: (request: NormalizedRequest) => void;

  // called after response is received. If value is returned, it replaces the response output.
  responseHook?: (
    response: NormalizedResponse,
    span: Span,
    tracer: Tracer,
    config: AwsSdkInstrumentationConfig,
    startTime: HrTime
  ) => any | undefined;

  updateMetricInstruments?: (meter: Meter) => void;
}
