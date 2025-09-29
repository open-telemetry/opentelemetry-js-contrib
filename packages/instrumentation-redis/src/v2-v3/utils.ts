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
