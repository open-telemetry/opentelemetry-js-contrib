/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context, Span, SpanStatusCode } from '@opentelemetry/api';
import { EventEmitter } from 'events';

export const endSpan = (span: Span, err?: Error | null) => {
  if (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
  }
  span.end();
};

export const getTracedCreateClient = (original: Function) => {
  return function createClientTrace(this: any) {
    const client = original.apply(this, arguments);
    return context.bind(context.active(), client);
  };
};

export const getTracedCreateStreamTrace = (original: Function) => {
  return function create_stream_trace(this: any) {
    if (!Object.prototype.hasOwnProperty.call(this, 'stream')) {
      Object.defineProperty(this, 'stream', {
        get() {
          return this._patched_redis_stream;
        },
        set(val: EventEmitter) {
          context.bind(context.active(), val);
          this._patched_redis_stream = val;
        },
      });
    }
    return original.apply(this, arguments);
  };
};
