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
