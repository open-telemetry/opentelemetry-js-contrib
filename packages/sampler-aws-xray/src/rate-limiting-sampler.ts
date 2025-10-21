/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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

  shouldSample(
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
