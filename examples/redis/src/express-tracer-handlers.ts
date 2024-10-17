'use strict';

import {trace, context,ROOT_CONTEXT,SpanKind,SpanStatusCode,Tracer} from '@opentelemetry/api';

export function getMiddlewareTracer(tracer: Tracer) {
  return (req: any, res: any, next: any) => {
    const span = tracer.startSpan(`express.middleware.tracer(${req.method} ${req.path})`, {
      kind: SpanKind.SERVER,
    });

    // End this span before sending out the response
    const originalSend = res.send;
    res.send = function send(...args: any[]) {
      span.end();
      originalSend.apply(res, args);
    };

    context.with(trace.setSpan(ROOT_CONTEXT, span), next);
  };
}

export function getErrorTracer(tracer: Tracer) {
  return (err: any, _req: any, res: any, _next: any) => {
    console.error('Caught error', err.message);
    const span = trace.getSpan(context.active())

    if (span) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    }
    res.status(500).send(err.message);
  };
}

