/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Span, SpanStatusCode } from '@opentelemetry/api';

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
