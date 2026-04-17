/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { NestInstrumentation as NestInstrumentationBase } from '@opentelemetry/instrumentation-nestjs';

/**
 * @deprecated Use `@opentelemetry/instrumentation-nestjs` instead.
 * This compatibility wrapper preserves the historical core-only scope by
 * forcing `instrumentMicroservices` to `false`.
 */
export class NestInstrumentation extends NestInstrumentationBase {
  constructor(config: InstrumentationConfig = {}) {
    super(NestInstrumentation.withCoreOnlyScope(config));
  }

  override setConfig(config: InstrumentationConfig = {}) {
    super.setConfig(NestInstrumentation.withCoreOnlyScope(config));
  }

  private static withCoreOnlyScope(config: InstrumentationConfig) {
    return {
      ...config,
      instrumentMicroservices: false,
    };
  }
}
