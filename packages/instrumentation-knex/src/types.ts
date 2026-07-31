/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface KnexInstrumentationConfig extends InstrumentationConfig {
  /** max query length in db.statement attribute ".." is added to the end when query is truncated  */
  maxQueryLength?: number;
  /** only create spans if part of an existing trace */
  requireParentSpan?: boolean;
}
