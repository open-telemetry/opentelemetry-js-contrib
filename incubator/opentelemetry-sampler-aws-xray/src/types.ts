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
export interface SamplingRule {
  // a unique name for the rule
  RuleName: string;

  // (integer between 1 and 9999) - the priority of the sampling rule. Services evaluate rules in ascending order of
  // priority, and make a sampling decision with the first rule that matches.
  Priority: number;

  // A fixed number of matching requests to instrument per second, before applying the fixed rate.
  ReservoirSize: number;

  // The percentage of matching requests to instrument, after the reservoir is exhausted.
  FixedRate: number;

  // The name of the instrumented service, as it appears in the X-Ray service map.
  ServiceName: string;

  // The service type, as it appears in the X-Ray service map.
  ServiceType: string;

  // The hostname from the HTTP host header.
  Host: string;

  // The method of the HTTP request.
  HTTPMethod: string;

  // the URL path of the request
  URLPath: string;

  // The ARN of the AWS resource running the service.
  ResourceARN: string;

  // (Optional) segment attributes that are known when the sampling decision is made.
  Attributes?: { [key: string]: string };
  Version: number;
}

export interface SamplingRuleRecord {
  CreatedAt: number;
  ModifiedAt: number;
  SamplingRule?: SamplingRule;
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
  // endpoint of awsproxy - for more information see https://aws-otel.github.io/docs/getting-started/remote-sampling
  // defaults to localhost:2000 if not specified
  endpoint?: string;

  // interval of polling sampling rules (in ms)
  // defaults to 5 minutes if not specified
  pollingIntervalMs?: number;
}
