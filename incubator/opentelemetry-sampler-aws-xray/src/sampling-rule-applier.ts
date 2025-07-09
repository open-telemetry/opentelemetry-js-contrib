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

import {
  AttributeValue,
  Attributes,
  Context,
  Link,
  SpanKind,
  diag,
} from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import {
  SamplingDecision,
  SamplingResult,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import {
  ATTR_CLIENT_ADDRESS,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_SERVER_ADDRESS,
  ATTR_URL_FULL,
  ATTR_URL_PATH,
  ATTR_SERVICE_NAME,
  SEMRESATTRS_FAAS_ID,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_HTTP_HOST,
  ATTR_HTTP_METHOD,
  ATTR_HTTP_URL,
  ATTR_HTTP_TARGET,
  ATTR_CLOUD_PLATFORM,
  ATTR_AWS_ECS_CLUSTER_ARN,
  ATTR_AWS_ECS_CONTAINER_ARN,
  ATTR_AWS_EKS_CLUSTER_ARN,
  CLOUD_PLATFORM_VALUE_AWS_LAMBDA,
  ATTR_AWS_LAMBDA_INVOKED_ARN,
  ATTR_CLOUD_RESOURCE_ID,
} from './semconv';
import { ISamplingRule, SamplingTargetDocument } from './types';
import { SamplingRule } from './sampling-rule';
import { Statistics } from './statistics';
import { CLOUD_PLATFORM_MAPPING, attributeMatch, wildcardMatch } from './utils';

export class SamplingRuleApplier {
  public samplingRule: SamplingRule;
  private fixedRateSampler: TraceIdRatioBasedSampler;
  private statistics: Statistics;

  constructor(
    samplingRule: ISamplingRule,
    statistics: Statistics = new Statistics(),
    target?: SamplingTargetDocument
  ) {
    this.samplingRule = new SamplingRule(samplingRule);

    this.fixedRateSampler = new TraceIdRatioBasedSampler(
      this.samplingRule.FixedRate
    );
    // TODO: Add Reservoir Sampler (Rate Limiting Sampler)

    this.statistics = statistics;
    this.statistics.resetStatistics();

    // TODO: Update Sampling Targets using provided `target` parameter
  }

  public matches(attributes: Attributes, resource: Resource): boolean {
    let httpTarget: AttributeValue | undefined = undefined;
    let httpUrl: AttributeValue | undefined = undefined;
    let httpMethod: AttributeValue | undefined = undefined;
    let httpHost: AttributeValue | undefined = undefined;
    let serviceName: AttributeValue | undefined = undefined;

    if (attributes) {
      httpTarget = attributes[ATTR_HTTP_TARGET] ?? attributes[ATTR_URL_PATH];
      httpUrl = attributes[ATTR_HTTP_URL] ?? attributes[ATTR_URL_FULL];
      httpMethod =
        attributes[ATTR_HTTP_METHOD] ?? attributes[ATTR_HTTP_REQUEST_METHOD];
      httpHost =
        attributes[ATTR_HTTP_HOST] ??
        attributes[ATTR_SERVER_ADDRESS] ??
        attributes[ATTR_CLIENT_ADDRESS];
    }

    let serviceType: AttributeValue | undefined = undefined;
    let resourceARN: AttributeValue | undefined = undefined;

    if (resource) {
      serviceName = resource.attributes[ATTR_SERVICE_NAME] || '';
      const cloudPlatform: AttributeValue | undefined =
        resource.attributes[ATTR_CLOUD_PLATFORM];
      if (typeof cloudPlatform === 'string') {
        serviceType = CLOUD_PLATFORM_MAPPING[cloudPlatform];
      }
      resourceARN = this.getArn(resource, attributes);
    }

    // target may be in url
    if (httpTarget === undefined && typeof httpUrl === 'string') {
      const schemeEndIndex: number = httpUrl.indexOf('://');
      // For network calls, URL usually has `scheme://host[:port][path][?query][#fragment]` format
      // Per spec, url.full is always populated with scheme://
      // If scheme is not present, assume it's bad instrumentation and ignore.
      if (schemeEndIndex > -1) {
        try {
          httpTarget = new URL(httpUrl).pathname;
          if (httpTarget === '') httpTarget = '/';
        } catch (e: unknown) {
          diag.debug(`Unable to create URL object from url: ${httpUrl}`, e);
        }
      }
    }

    if (httpTarget === undefined) {
      // When missing, the URL Path is assumed to be '/'
      httpTarget = '/';
    }

    return (
      attributeMatch(attributes, this.samplingRule.Attributes) &&
      wildcardMatch(this.samplingRule.Host, httpHost) &&
      wildcardMatch(this.samplingRule.HTTPMethod, httpMethod) &&
      wildcardMatch(this.samplingRule.ServiceName, serviceName) &&
      wildcardMatch(this.samplingRule.URLPath, httpTarget) &&
      wildcardMatch(this.samplingRule.ServiceType, serviceType) &&
      wildcardMatch(this.samplingRule.ResourceARN, resourceARN)
    );
  }

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    // TODO: Record Sampling Statistics

    let result: SamplingResult = { decision: SamplingDecision.NOT_RECORD };

    // TODO: Apply Reservoir Sampling

    if (result.decision === SamplingDecision.NOT_RECORD) {
      result = this.fixedRateSampler.shouldSample(context, traceId);
    }

    return result;
  }

  private getArn(
    resource: Resource,
    attributes: Attributes
  ): AttributeValue | undefined {
    let arn: AttributeValue | undefined =
      resource.attributes[ATTR_AWS_ECS_CONTAINER_ARN] ||
      resource.attributes[ATTR_AWS_ECS_CLUSTER_ARN] ||
      resource.attributes[ATTR_AWS_EKS_CLUSTER_ARN];

    if (
      arn === undefined &&
      resource?.attributes[ATTR_CLOUD_PLATFORM] ===
        CLOUD_PLATFORM_VALUE_AWS_LAMBDA
    ) {
      arn = this.getLambdaArn(resource, attributes);
    }
    return arn;
  }

  private getLambdaArn(
    resource: Resource,
    attributes: Attributes
  ): AttributeValue | undefined {
    const arn: AttributeValue | undefined =
      resource?.attributes[ATTR_CLOUD_RESOURCE_ID] ||
      resource?.attributes[SEMRESATTRS_FAAS_ID] ||
      attributes[ATTR_AWS_LAMBDA_INVOKED_ARN];
    return arn;
  }
}
