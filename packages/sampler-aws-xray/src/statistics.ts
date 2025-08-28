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
