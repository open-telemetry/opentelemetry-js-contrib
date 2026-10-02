/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstrumentationConfig as BaseInstrumentationConfig } from '@opentelemetry/instrumentation';

export interface InstrumentationConfig extends BaseInstrumentationConfig {
  enhancedDatabaseReporting?: boolean;
}
