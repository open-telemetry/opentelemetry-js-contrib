/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface RuntimeNodeInstrumentationConfig
  extends InstrumentationConfig {
  monitoringPrecision?: number;
}
