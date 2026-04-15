/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Meter } from '@opentelemetry/api';

export interface MetricCollector {
  updateMetricInstruments(meter: Meter): void;

  enable(): void;

  disable(): void;
}
