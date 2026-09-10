/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';

export class DummySpanExporter implements SpanExporter {
  export(_spans: ReadableSpan[]) {}

  shutdown() {
    return Promise.resolve();
  }
}
