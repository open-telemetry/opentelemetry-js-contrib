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

import { Resource } from '@opentelemetry/resources';

export interface AWSXRayRemoteSamplerConfig {
  // resource to control sampling at the service level
  resource: Resource;

  // endpoint of awsproxy - for more information see https://aws-otel.github.io/docs/getting-started/remote-sampling
  endpoint?: string;

  // interval for polling sampling rules
  pollingInterval?: number;
}

// https://docs.aws.amazon.com/xray/latest/api/API_SamplingRule.html
export interface ISamplingRule {
  // A unique name for the rule
  RuleName?: string;

  // The ARN of the sampling rule
  RuleARN?: string;

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

  // Segment attributes to be matched when the sampling decision is being made.
  Attributes?: { [key: string]: string };

  Version: number;
}

// https://docs.aws.amazon.com/xray/latest/api/API_SamplingRuleRecord.html
export interface SamplingRuleRecord {
  CreatedAt?: number;
  ModifiedAt?: number;
  SamplingRule?: ISamplingRule;
}

// https://docs.aws.amazon.com/xray/latest/api/API_GetSamplingRules.html#API_GetSamplingRules_ResponseSyntax
export interface GetSamplingRulesResponse {
  NextToken?: string;
  SamplingRuleRecords?: SamplingRuleRecord[];
}

export interface ISamplingStatistics {
  // RequestCount is the number of requests matched against a specific rule.
  RequestCount: number;

  // SampleCount is the number of requests sampled using a specific rule.
  SampleCount: number;

  // BorrowCount is the number of requests borrowed using a specific rule.
  BorrowCount: number;
}

// https://docs.aws.amazon.com/xray/latest/api/API_GetSamplingTargets.html#API_GetSamplingTargets_RequestSyntax
// SamplingStatisticsDocument is used to store current state of sampling statistics.
export interface SamplingStatisticsDocument {
  // A unique identifier for the service in hexadecimal.
  ClientID: string;
  // The name of the sampling rule.
  RuleName: string;
  // The number of requests that matched the rule.
  RequestCount: number;
  // The number of requests borrowed using the rule.
  BorrowCount: number;
  // The number of requests sampled using the rule.
  SampledCount: number;
  // The current time.
  Timestamp: number;
}

// https://docs.aws.amazon.com/xray/latest/api/API_GetSamplingTargets.html#API_GetSamplingTargets_RequestBody
export interface SamplingTargetDocument {
  // The percentage of matching requests to instrument, after the reservoir is exhausted.
  FixedRate: number;
  // The number of seconds to wait before fetching sampling targets again
  Interval?: number | null;
  // The number of requests per second that X-Ray allocated this service.
  ReservoirQuota?: number | null;
  // Time when the reservoir quota will expire
  ReservoirQuotaTTL?: number | null;
  // The name of the sampling rule
  RuleName: string;
}

// https://docs.aws.amazon.com/xray/latest/api/API_GetSamplingTargets.html#API_GetSamplingTargets_RequestBody
export interface UnprocessedStatistic {
  ErrorCode: string;
  Message: string;
  RuleName: string;
}

// https://docs.aws.amazon.com/xray/latest/api/API_GetSamplingTargets.html#API_GetSamplingTargets_RequestBody
export interface GetSamplingTargetsBody {
  SamplingStatisticsDocuments: SamplingStatisticsDocument[];
}

// https://docs.aws.amazon.com/xray/latest/api/API_GetSamplingTargets.html#API_GetSamplingTargets_ResponseSyntax
export interface GetSamplingTargetsResponse {
  LastRuleModification: number;
  SamplingTargetDocuments: SamplingTargetDocument[];
  UnprocessedStatistics: UnprocessedStatistic[];
}

export interface TargetMap {
  [targetName: string]: SamplingTargetDocument;
}
