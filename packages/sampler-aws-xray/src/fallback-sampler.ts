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
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { RateLimitingSampler } from './rate-limiting-sampler';

// FallbackSampler samples 1 req/sec and additional 5% of requests using TraceIdRatioBasedSampler.
export class FallbackSampler implements Sampler {
  private fixedRateSampler: TraceIdRatioBasedSampler;
  private rateLimitingSampler: RateLimitingSampler;

  constructor(ratio = 0.05, quota = 1) {
    this.fixedRateSampler = new TraceIdRatioBasedSampler(ratio);
    this.rateLimitingSampler = new RateLimitingSampler(quota);
  }

  public shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    const samplingResult: SamplingResult =
      this.rateLimitingSampler.shouldSample(
        context,
        traceId,
        spanName,
        spanKind,
        attributes,
        links
      );

    if (samplingResult.decision !== SamplingDecision.NOT_RECORD) {
      return samplingResult;
    }

    return this.fixedRateSampler.shouldSample(context, traceId);
  }

  public toString(): string {
    return 'FallbackSampler{fallback sampling with sampling config of 1 req/sec and 5% of additional requests}';
  }
}
