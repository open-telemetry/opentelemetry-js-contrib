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

import { ISamplingStatistics } from './types';

export class Statistics implements ISamplingStatistics {
  public matchedRequests: number;
  public sampledRequests: number;
  public borrowedRequests: number;

  constructor() {
    // This will be modified to accept & initialize these values in the constructor
    this.matchedRequests = 0;
    this.sampledRequests = 0;
    this.borrowedRequests = 0;
  }

  public getStatistics = (): {} => {
    return {
      matchedRequests: this.matchedRequests,
      sampledRequests: this.sampledRequests,
      borrowedRequests: this.borrowedRequests,
    };
  };

  public resetStatistics = () => {
    this.matchedRequests = 0;
    this.sampledRequests = 0;
    this.borrowedRequests = 0;
  };
}
