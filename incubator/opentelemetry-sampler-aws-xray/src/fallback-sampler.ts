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
  SamplingResult,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';

// FallbackSampler samples 1 req/sec and additional 5% of requests using TraceIdRatioBasedSampler.
export class FallbackSampler implements Sampler {
  private fixedRateSampler: TraceIdRatioBasedSampler;

  constructor() {
    this.fixedRateSampler = new TraceIdRatioBasedSampler(0.05);
  }

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    // TODO: implement and use Rate Limiting Sampler

    return this.fixedRateSampler.shouldSample(context, traceId);
  }

  public toString(): string {
    return 'FallbackSampler{fallback sampling with sampling config of 1 req/sec and 5% of additional requests}';
  }
}
