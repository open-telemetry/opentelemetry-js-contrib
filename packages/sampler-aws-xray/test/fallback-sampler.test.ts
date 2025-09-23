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

import { SpanKind, context } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { expect } from 'expect';
import * as sinon from 'sinon';
import { FallbackSampler } from '../src/fallback-sampler';
import { testTraceId } from './remote-sampler.test';

let clock: sinon.SinonFakeTimers;

describe('FallBackSampler', () => {
  beforeEach(() => {
    clock = sinon.useFakeTimers(Date.now());
  });
  afterEach(() => {
    try {
      clock.restore();
    } catch {
      // do nothing
    }
  });
  it('testShouldSampleWithQuotaOnly', () => {
    // Ensure FallbackSampler's internal TraceIdRatioBasedSampler will always return SamplingDecision.NOT_RECORD
    const sampler = new FallbackSampler(0);

    sampler.shouldSample(
      context.active(),
      testTraceId,
      'name',
      SpanKind.CLIENT,
      {},
      []
    );

    // 0 seconds passed, 0 quota available
    let sampled = 0;
    for (let i = 0; i < 30; i++) {
      if (
        sampler.shouldSample(
          context.active(),
          testTraceId,
          'name',
          SpanKind.CLIENT,
          {},
          []
        ).decision !== SamplingDecision.NOT_RECORD
      ) {
        sampled += 1;
      }
    }
    expect(sampled).toEqual(0);

    // 0.4 seconds passed, 0.4 quota available
    sampled = 0;
    clock.tick(0.4 * 1000);
    for (let i = 0; i < 30; i++) {
      if (
        sampler.shouldSample(
          context.active(),
          testTraceId,
          'name',
          SpanKind.CLIENT,
          {},
          []
        ).decision !== SamplingDecision.NOT_RECORD
      ) {
        sampled += 1;
      }
    }
    expect(sampled).toEqual(0);

    // 0.8 seconds passed, 0.8 quota available
    sampled = 0;
    clock.tick(0.4 * 1000);
    for (let i = 0; i < 30; i++) {
      if (
        sampler.shouldSample(
          context.active(),
          testTraceId,
          'name',
          SpanKind.CLIENT,
          {},
          []
        ).decision !== SamplingDecision.NOT_RECORD
      ) {
        sampled += 1;
      }
    }
    expect(sampled).toEqual(0);

    // 1.2 seconds passed, 1 quota consumed, 0 quota available
    sampled = 0;
    clock.tick(0.4 * 1000);
    for (let i = 0; i < 30; i++) {
      if (
        sampler.shouldSample(
          context.active(),
          testTraceId,
          'name',
          SpanKind.CLIENT,
          {},
          []
        ).decision !== SamplingDecision.NOT_RECORD
      ) {
        sampled += 1;
      }
    }
    expect(sampled).toEqual(1);

    // 1.6 seconds passed, 0.4 quota available
    sampled = 0;
    clock.tick(0.4 * 1000);
    for (let i = 0; i < 30; i++) {
      if (
        sampler.shouldSample(
          context.active(),
          testTraceId,
          'name',
          SpanKind.CLIENT,
          {},
          []
        ).decision !== SamplingDecision.NOT_RECORD
      ) {
        sampled += 1;
      }
    }
    expect(sampled).toEqual(0);

    // 2.0 seconds passed, 0.8 quota available
    sampled = 0;
    clock.tick(0.4 * 1000);
    for (let i = 0; i < 30; i++) {
      if (
        sampler.shouldSample(
          context.active(),
          testTraceId,
          'name',
          SpanKind.CLIENT,
          {},
          []
        ).decision !== SamplingDecision.NOT_RECORD
      ) {
        sampled += 1;
      }
    }
    expect(sampled).toEqual(0);

    // 2.4 seconds passed, one more quota consumed, 0 quota available
    sampled = 0;
    clock.tick(0.4 * 1000);
    for (let i = 0; i < 30; i++) {
      if (
        sampler.shouldSample(
          context.active(),
          testTraceId,
          'name',
          SpanKind.CLIENT,
          {},
          []
        ).decision !== SamplingDecision.NOT_RECORD
      ) {
        sampled += 1;
      }
    }
    expect(sampled).toEqual(1);

    // 100 seconds passed, only one quota can be consumed
    sampled = 0;
    clock.tick(100 * 1000);
    for (let i = 0; i < 30; i++) {
      if (
        sampler.shouldSample(
          context.active(),
          testTraceId,
          'name',
          SpanKind.CLIENT,
          {},
          []
        ).decision !== SamplingDecision.NOT_RECORD
      ) {
        sampled += 1;
      }
    }
    expect(sampled).toEqual(1);
  });

  it('toString()', () => {
    expect(new FallbackSampler().toString()).toEqual(
      'FallbackSampler{fallback sampling with sampling config of 1 req/sec and 5% of additional requests}'
    );
  });
});
