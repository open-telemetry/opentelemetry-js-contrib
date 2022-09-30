'use strict';

import * as api from '@opentelemetry/api';

export function getMiddlewareTracer(tracer: api.Tracer) {
  return (req: any, res: any, next: any) => {
    const span = tracer.startSpan(`express.middleware.tracer(${req.method} ${req.path})`, {
      kind: api.SpanKind.SERVER,
    });

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
    const span = api.trace.getSpan(api.context.active())

    if (span) {
      span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
    }
    res.status(500).send(err.message);
  };
}

