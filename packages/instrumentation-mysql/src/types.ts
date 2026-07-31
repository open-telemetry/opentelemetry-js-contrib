/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface MySQLInstrumentationConfig extends InstrumentationConfig {
  /**
   * If true, an attribute containing the query's parameters will be attached
   * the spans generated to represent the query.
   */
  enhancedDatabaseReporting?: boolean;
}
