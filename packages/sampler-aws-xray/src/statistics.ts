/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Includes work from:
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ISamplingStatistics } from './types';

export class Statistics implements ISamplingStatistics {
  public RequestCount: number;
  public SampleCount: number;
  public BorrowCount: number;

  constructor(requestCount = 0, sampleCount = 0, borrowCount = 0) {
    this.RequestCount = requestCount;
    this.SampleCount = sampleCount;
    this.BorrowCount = borrowCount;
  }

  public getStatistics(): ISamplingStatistics {
    return {
      RequestCount: this.RequestCount,
      SampleCount: this.SampleCount,
      BorrowCount: this.BorrowCount,
    };
  }

  public resetStatistics(): void {
    this.RequestCount = 0;
    this.SampleCount = 0;
    this.BorrowCount = 0;
  }
}
