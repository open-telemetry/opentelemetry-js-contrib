/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as tracing from '@opentelemetry/sdk-trace-base';

export class DummySpanExporter implements tracing.SpanExporter {
  export(_spans: tracing.ReadableSpan[]) {}

  shutdown() {
    return Promise.resolve();
  }
}
