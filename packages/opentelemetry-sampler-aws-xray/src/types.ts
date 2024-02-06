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

// X-Ray Sampling rule reference: https://docs.aws.amazon.com/xray/latest/api/API_GetSamplingRules.html
import { SamplingRule } from './sampling-rule';
import { Resource } from '@opentelemetry/resources';

export interface ISamplingRule {
  matches(samplingRequest: any, resource: Resource): boolean;
}

export interface SamplingRuleRecord {
  CreatedAt: number;
  ModifiedAt: number;
  SamplingRule?: SamplingRule;
}

// TODO: move to internal-types.ts (for types that should not be exported from this package)
export interface ISamplingStatistics {
  // matchedRequests is the number of requests matched against specific rule.
  matchedRequests: number;

  // sampledRequests is the number of requests sampled using specific rule.
  sampledRequests: number;

  // borrowedRequests is the number of requests borrowed using specific rule.
  borrowedRequests: number;
}

export interface GetSamplingRulesResponse {
  NextToken?: string;
  SamplingRuleRecords?: SamplingRuleRecord[];
}

// samplingStatisticsDocument is used to store current state of sampling data.
export interface SamplingStatisticsDocument {
  // A unique identifier for the service in hexadecimal.
  ClientID: string;
  // The name of the sampling rule.
  RuleName: string;
  // The number of requests that matched the rule.
  RequestCount: number;
  // The number of requests borrowed.
  BorrowCount: number;
  // The number of requests sampled using the rule.
  SampledCount: number;
  // The current time.
  Timestamp: number;
}

export interface AWSXRaySamplerConfig {
  // resource to control sampling at the service level
  resource: Resource;

  // endpoint of awsproxy - for more information see https://aws-otel.github.io/docs/getting-started/remote-sampling
  // defaults to localhost:2000 if not specified
  endpoint?: string;

  // interval of polling sampling rules (in ms)
  // defaults to 5 minutes if not specified
  pollingIntervalMs?: number;
}
