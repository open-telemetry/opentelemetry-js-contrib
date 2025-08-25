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
import { Statistics } from '../src/statistics';

describe('Statistics', () => {
  it('construct statistics and get statistics', () => {
    const statistics = new Statistics(12, 3456, 7);
    expect(statistics.RequestCount).toEqual(12);
    expect(statistics.SampleCount).toEqual(3456);
    expect(statistics.BorrowCount).toEqual(7);
    const obtainedStatistics = statistics.getStatistics();
    expect(obtainedStatistics.RequestCount).toEqual(12);
    expect(obtainedStatistics.SampleCount).toEqual(3456);
    expect(obtainedStatistics.BorrowCount).toEqual(7);
  });
});
