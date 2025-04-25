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
  Attributes,
  Context,
  DiagLogger,
  Link,
  SpanKind,
  diag,
} from '@opentelemetry/api';
import {
  ParentBasedSampler,
  Sampler,
  SamplingDecision,
  SamplingResult,
} from '@opentelemetry/sdk-trace-base';
import { AWSXRaySamplingClient } from './aws-xray-sampling-client';
import {
  AWSXRayRemoteSamplerConfig,
  GetSamplingRulesResponse,
  SamplingRuleRecord,
} from './types';
import { SamplingRuleApplier } from './sampling-rule-applier';

// 5 minute default sampling rules polling interval
const DEFAULT_RULES_POLLING_INTERVAL_SECONDS: number = 5 * 60;
// Default endpoint for awsproxy : https://aws-otel.github.io/docs/getting-started/remote-sampling#enable-awsproxy-extension
const DEFAULT_AWS_PROXY_ENDPOINT = 'http://localhost:2000';

// Wrapper class to ensure that all XRay Sampler Functionality in _AWSXRayRemoteSampler
// uses ParentBased logic to respect the parent span's sampling decision
export class AWSXRayRemoteSampler implements Sampler {
  private _root: ParentBasedSampler;
  private internalXraySampler: _AWSXRayRemoteSampler;
  constructor(samplerConfig: AWSXRayRemoteSamplerConfig) {
    this.internalXraySampler = new _AWSXRayRemoteSampler(samplerConfig);
    this._root = new ParentBasedSampler({
      root: this.internalXraySampler,
    });
  }
  public shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    return this._root.shouldSample(
      context,
      traceId,
      spanName,
      spanKind,
      attributes,
      links
    );
  }

  public toString(): string {
    return `AWSXRayRemoteSampler{root=${this._root.toString()}`;
  }

  public stopPollers() {
    this.internalXraySampler.stopPollers();
  }
}

// IN PROGRESS - SKELETON CLASS
//
// _AWSXRayRemoteSampler contains all core XRay Sampler Functionality,
// however it is NOT Parent-based (e.g. Sample logic runs for each span)
// Not intended for external use, use Parent-based `AWSXRayRemoteSampler` instead.
export class _AWSXRayRemoteSampler implements Sampler {
  private rulePollingIntervalMillis: number;
  private awsProxyEndpoint: string;
  private samplerDiag: DiagLogger;
  private rulePoller: NodeJS.Timeout | undefined;
  private rulePollingJitterMillis: number;
  private samplingClient: AWSXRaySamplingClient;

  constructor(samplerConfig: AWSXRayRemoteSamplerConfig) {
    this.samplerDiag = diag;

    if (
      samplerConfig.pollingInterval == null ||
      samplerConfig.pollingInterval < 10
    ) {
      this.samplerDiag.warn(
        `'pollingInterval' is undefined or too small. Defaulting to ${DEFAULT_RULES_POLLING_INTERVAL_SECONDS} seconds`
      );
      this.rulePollingIntervalMillis =
        DEFAULT_RULES_POLLING_INTERVAL_SECONDS * 1000;
    } else {
      this.rulePollingIntervalMillis = samplerConfig.pollingInterval * 1000;
    }

    this.rulePollingJitterMillis = Math.random() * 5 * 1000;

    this.awsProxyEndpoint = samplerConfig.endpoint
      ? samplerConfig.endpoint
      : DEFAULT_AWS_PROXY_ENDPOINT;

    this.samplingClient = new AWSXRaySamplingClient(
      this.awsProxyEndpoint,
      this.samplerDiag
    );

    // Start the Sampling Rules poller
    this.startSamplingRulesPoller();

    // TODO: Start the Sampling Targets poller
  }

  public shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    // Implementation to be added
    return { decision: SamplingDecision.NOT_RECORD };
  }

  public toString(): string {
    return `_AWSXRayRemoteSampler{awsProxyEndpoint=${
      this.awsProxyEndpoint
    }, rulePollingIntervalMillis=${this.rulePollingIntervalMillis.toString()}}`;
  }

  public stopPollers() {
    clearInterval(this.rulePoller);
  }

  private startSamplingRulesPoller(): void {
    // Execute first update
    this.getAndUpdateSamplingRules();
    // Update sampling rules every 5 minutes (or user-defined polling interval)
    this.rulePoller = setInterval(
      () => this.getAndUpdateSamplingRules(),
      this.rulePollingIntervalMillis + this.rulePollingJitterMillis
    );
    this.rulePoller.unref();
  }

  private getAndUpdateSamplingRules(): void {
    this.samplingClient.fetchSamplingRules(this.updateSamplingRules.bind(this));
  }

  private updateSamplingRules(responseObject: GetSamplingRulesResponse): void {
    let samplingRules: SamplingRuleApplier[] = [];

    samplingRules = [];
    if (responseObject.SamplingRuleRecords) {
      responseObject.SamplingRuleRecords.forEach(
        (record: SamplingRuleRecord) => {
          if (record.SamplingRule) {
            samplingRules.push(
              new SamplingRuleApplier(record.SamplingRule, undefined)
            );
          }
        }
      );

      // TODO: pass samplingRules to rule cache, temporarily logging the samplingRules array
      this.samplerDiag.debug('sampling rules: ', samplingRules);
    } else {
      this.samplerDiag.error(
        'SamplingRuleRecords from GetSamplingRules request is not defined'
      );
    }
  }
}
