/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export type IgnoreMatcher = string | RegExp | ((url: string) => boolean);
export interface DnsInstrumentationConfig extends InstrumentationConfig {
  ignoreHostnames?: IgnoreMatcher | IgnoreMatcher[];
}
