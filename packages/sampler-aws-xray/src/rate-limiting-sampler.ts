/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Includes work from:
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Attributes, Context, Link, SpanKind } from '@opentelemetry/api';
import {
  Sampler,
  SamplingDecision,
  SamplingResult,
} from '@opentelemetry/sdk-trace-base';
import { RateLimiter } from './rate-limiter';

export class RateLimitingSampler implements Sampler {
  private quota: number;
  private reservoir: RateLimiter;

  constructor(quota: number) {
    this.quota = quota;
    this.reservoir = new RateLimiter(quota);
  }

  public shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    if (this.reservoir.take(1)) {
      return {
        decision: SamplingDecision.RECORD_AND_SAMPLED,
        attributes: attributes,
      };
    }
    return { decision: SamplingDecision.NOT_RECORD, attributes: attributes };
  }

  public toString(): string {
    return `RateLimitingSampler{rate limiting sampling with sampling config of ${this.quota} req/sec and 0% of additional requests}`;
  }
}
