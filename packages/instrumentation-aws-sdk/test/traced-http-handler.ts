/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { SpanKind, trace } from '@opentelemetry/api';
import { NodeHttpHandler } from '@smithy/node-http-handler';

export const HTTP_SPAN_NAME = 'test HTTP request';

/**
 * A request handler that starts a span for each HTTP request in the active
 * context, standing in for an HTTP client instrumentation.
 */
export class TracedHttpHandler extends NodeHttpHandler {
  override async handle(
    ...args: Parameters<NodeHttpHandler['handle']>
  ): ReturnType<NodeHttpHandler['handle']> {
    const span = trace
      .getTracer('test-http')
      .startSpan(HTTP_SPAN_NAME, { kind: SpanKind.CLIENT });
    try {
      return await super.handle(...args);
    } finally {
      span.end();
    }
  }
}
