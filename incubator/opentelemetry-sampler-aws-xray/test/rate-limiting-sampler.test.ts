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
import { RateLimitingSampler } from '../src/rate-limiting-sampler';
import { testTraceId } from './remote-sampler.test';

let clock: sinon.SinonFakeTimers;

describe('RateLimitingSampler', () => {
  beforeEach(() => {
    clock = sinon.useFakeTimers(Date.now());
  });
  afterEach(() => {
    clock.restore();
  });
  it('testShouldSample', () => {
    const sampler = new RateLimitingSampler(30);

    let sampled = 0;
    for (let i = 0; i < 100; i++) {
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

    clock.tick(0.5 * 1000); // Move forward half a second

    sampled = 0;
    for (let i = 0; i < 100; i++) {
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
    expect(sampled).toEqual(15);

    clock.tick(1 * 1000); // Move forward 1 second

    sampled = 0;
    for (let i = 0; i < 100; i++) {
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
    expect(sampled).toEqual(30);

    clock.tick(2.5 * 1000); // Move forward 2.5 seconds

    sampled = 0;
    for (let i = 0; i < 100; i++) {
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
    expect(sampled).toEqual(30);

    clock.tick(1000 * 1000); // Move forward 1000 seconds

    sampled = 0;
    for (let i = 0; i < 100; i++) {
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
    expect(sampled).toEqual(30);
  });

  it('testShouldSampleWithQuotaOfOne', () => {
    const sampler = new RateLimitingSampler(1);

    let sampled = 0;
    for (let i = 0; i < 50; i++) {
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

    clock.tick(0.5 * 1000); // Move forward half a second

    sampled = 0;
    for (let i = 0; i < 50; i++) {
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

    clock.tick(0.5 * 1000);

    sampled = 0;
    for (let i = 0; i < 50; i++) {
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

    clock.tick(1000 * 1000); // Move forward 1000 seconds

    sampled = 0;
    for (let i = 0; i < 50; i++) {
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
    expect(new RateLimitingSampler(123).toString()).toEqual(
      'RateLimitingSampler{rate limiting sampling with sampling config of 123 req/sec and 0% of additional requests}'
    );
  });
});
