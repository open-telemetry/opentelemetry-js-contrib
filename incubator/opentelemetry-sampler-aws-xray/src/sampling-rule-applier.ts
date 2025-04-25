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

import { ISamplingRule, SamplingTargetDocument } from './types';
import { SamplingRule } from './sampling-rule';
import { Statistics } from './statistics';

export class SamplingRuleApplier {
  public samplingRule: SamplingRule;

  constructor(
    samplingRule: ISamplingRule,
    statistics: Statistics = new Statistics(),
    target?: SamplingTargetDocument
  ) {
    this.samplingRule = new SamplingRule(samplingRule);
  }
}
