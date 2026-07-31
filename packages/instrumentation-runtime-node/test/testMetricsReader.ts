/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { MetricReader } from '@opentelemetry/sdk-metrics';
export class TestMetricReader extends MetricReader {
  constructor() {
    super();
  }

  protected async onForceFlush(): Promise<void> {}

  protected async onShutdown(): Promise<void> {}
}
