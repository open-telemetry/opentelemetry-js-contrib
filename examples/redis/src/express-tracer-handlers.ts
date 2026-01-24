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

import * as api from '@opentelemetry/api';

export function getMiddlewareTracer(tracer: api.Tracer) {
  return (req: any, res: any, next: any) => {
    const span = tracer.startSpan(
      `express.middleware.tracer(${req.method} ${req.path})`,
      {
        kind: api.SpanKind.SERVER,
      }
    );

    // End this span before sending out the response
    const originalSend = res.send;
    res.send = function send(...args: any[]) {
      span.end();
      originalSend.apply(res, args);
    };

    api.context.with(api.trace.setSpan(api.ROOT_CONTEXT, span), next);
  };
}

export function getErrorTracer(tracer: api.Tracer) {
  return (err: any, _req: any, res: any, _next: any) => {
    console.error('Caught error', err.message);
    const span = api.trace.getSpan(api.context.active());

    if (span) {
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
    }
    res.status(500).send(err.message);
  };
}
