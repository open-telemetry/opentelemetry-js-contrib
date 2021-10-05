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

import type * as ioredisTypes from 'ioredis';
import { Tracer, SpanKind, Span, SpanStatusCode } from '@opentelemetry/api';
import { IORedisInstrumentation } from './';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

export const endSpan = (
  span: Span,
  err: NodeJS.ErrnoException | null | undefined
) => {
  if (err) {
    span.recordException(err);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
  }
  span.end();
};

export const traceConnection = (tracer: Tracer, original: Function) => {
  return function (this: ioredisTypes.Redis) {
    const span = tracer.startSpan('connect', {
      kind: SpanKind.CLIENT,
      attributes: {
        [SemanticAttributes.DB_SYSTEM]: IORedisInstrumentation.DB_SYSTEM,
        [SemanticAttributes.DB_STATEMENT]: 'connect',
      },
    });
    const { host, port } = this.options;

    span.setAttributes({
      [SemanticAttributes.NET_PEER_NAME]: host,
      [SemanticAttributes.NET_PEER_PORT]: port,
      [SemanticAttributes.NET_PEER_IP]: `redis://${host}:${port}`,
    });
    try {
      const client = original.apply(this, arguments);
      endSpan(span, null);
      return client;
    } catch (error) {
      endSpan(span, error);
      throw error;
    }
  };
};
