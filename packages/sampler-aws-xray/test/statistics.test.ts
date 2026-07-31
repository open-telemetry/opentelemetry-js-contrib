/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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
