/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Includes work from:
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { expect } from 'expect';
import * as sinon from 'sinon';
import { RateLimiter } from '../src/rate-limiter';

let clock: sinon.SinonFakeTimers;
describe('RateLimiter', () => {
  beforeEach(() => {
    clock = sinon.useFakeTimers(Date.now());
  });
  afterEach(() => {
    clock.restore();
  });
  it('testTake', () => {
    const limiter = new RateLimiter(30, 1);

    let spent = 0;
    for (let i = 0; i < 100; i++) {
      if (limiter.take(1)) {
        spent++;
      }
    }
    expect(spent).toEqual(0);

    spent = 0;
    clock.tick(0.5 * 1000);
    for (let i = 0; i < 100; i++) {
      if (limiter.take(1)) {
        spent++;
      }
    }
    expect(spent).toEqual(15);

    spent = 0;
    clock.tick(1000 * 1000);
    for (let i = 0; i < 100; i++) {
      if (limiter.take(1)) {
        spent++;
      }
    }
    expect(spent).toEqual(30);
  });
});
