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
  SamplingResult,
} from '@opentelemetry/sdk-trace-base';
import { AWSXRaySamplingClient } from './aws-xray-sampling-client';
import { FallbackSampler } from './fallback-sampler';
import {
  AWSXRayRemoteSamplerConfig,
  GetSamplingRulesResponse,
  GetSamplingTargetsBody,
  GetSamplingTargetsResponse,
  SamplingRuleRecord,
  SamplingTargetDocument,
  TargetMap,
} from './types';
import {
  DEFAULT_TARGET_POLLING_INTERVAL_SECONDS,
  RuleCache,
} from './rule-cache';

import { SamplingRuleApplier } from './sampling-rule-applier';
import { PACKAGE_NAME } from './version';

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
  private targetPollingInterval: number;
  private awsProxyEndpoint: string;
  private ruleCache: RuleCache;
  private fallbackSampler: FallbackSampler;
  private samplerDiag: DiagLogger;
  private rulePoller: NodeJS.Timeout | undefined;
  private targetPoller: NodeJS.Timeout | undefined;
  private clientId: string;
  private rulePollingJitterMillis: number;
  private targetPollingJitterMillis: number;
  private samplingClient: AWSXRaySamplingClient;

  constructor(samplerConfig: AWSXRayRemoteSamplerConfig) {
    this.samplerDiag = diag.createComponentLogger({
      namespace: PACKAGE_NAME,
    });

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
    this.targetPollingInterval = this.getDefaultTargetPollingInterval();
    this.targetPollingJitterMillis = (Math.random() / 10) * 1000;

    this.awsProxyEndpoint = samplerConfig.endpoint
      ? samplerConfig.endpoint
      : DEFAULT_AWS_PROXY_ENDPOINT;
    this.fallbackSampler = new FallbackSampler();
    // TODO: Use clientId for retrieving Sampling Targets
    this.clientId = _AWSXRayRemoteSampler.generateClientId();
    this.ruleCache = new RuleCache(samplerConfig.resource);

    this.samplingClient = new AWSXRaySamplingClient(
      this.awsProxyEndpoint,
      this.samplerDiag
    );

    // Start the Sampling Rules poller
    this.startSamplingRulesPoller();

    // Start the Sampling Targets poller where the first poll occurs after the default interval
    this.startSamplingTargetsPoller();
  }

  public getDefaultTargetPollingInterval(): number {
    return DEFAULT_TARGET_POLLING_INTERVAL_SECONDS;
  }

  public shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    if (this.ruleCache.isExpired()) {
      this.samplerDiag.debug(
        'Rule cache is expired, so using fallback sampling strategy'
      );
      return this.fallbackSampler.shouldSample(
        context,
        traceId,
        spanName,
        spanKind,
        attributes,
        links
      );
    }

    try {
      const matchedRule: SamplingRuleApplier | undefined =
        this.ruleCache.getMatchedRule(attributes);
      if (matchedRule) {
        return matchedRule.shouldSample(
          context,
          traceId,
          spanName,
          spanKind,
          attributes,
          links
        );
      }
    } catch (e: unknown) {
      this.samplerDiag.debug(
        'Unexpected error occurred when trying to match or applying a sampling rule',
        e
      );
    }

    this.samplerDiag.debug(
      'Using fallback sampler as no rule match was found. This is likely due to a bug, since default rule should always match'
    );
    return this.fallbackSampler.shouldSample(
      context,
      traceId,
      spanName,
      spanKind,
      attributes,
      links
    );
  }

  public toString(): string {
    return `_AWSXRayRemoteSampler{awsProxyEndpoint=${
      this.awsProxyEndpoint
    }, rulePollingIntervalMillis=${this.rulePollingIntervalMillis.toString()}}`;
  }

  public stopPollers() {
    clearInterval(this.rulePoller);
    clearInterval(this.targetPoller);
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

  private startSamplingTargetsPoller(): void {
    // Update sampling targets every targetPollingInterval (usually 10 seconds)
    this.targetPoller = setInterval(
      () => this.getAndUpdateSamplingTargets(),
      this.targetPollingInterval * 1000 + this.targetPollingJitterMillis
    );
    this.targetPoller.unref();
  }

  private getAndUpdateSamplingTargets(): void {
    const requestBody: GetSamplingTargetsBody = {
      SamplingStatisticsDocuments:
        this.ruleCache.createSamplingStatisticsDocuments(this.clientId),
    };

    this.samplingClient.fetchSamplingTargets(
      requestBody,
      this.updateSamplingTargets.bind(this)
    );
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
      this.ruleCache.updateRules(samplingRules);
    } else {
      this.samplerDiag.error(
        'SamplingRuleRecords from GetSamplingRules request is not defined'
      );
    }
  }

  private updateSamplingTargets(
    responseObject: GetSamplingTargetsResponse
  ): void {
    try {
      const targetDocuments: TargetMap = {};

      // Create Target-Name-to-Target-Map from sampling targets response
      responseObject.SamplingTargetDocuments.forEach(
        (newTarget: SamplingTargetDocument) => {
          targetDocuments[newTarget.RuleName] = newTarget;
        }
      );

      // Update targets in the cache
      const [refreshSamplingRules, nextPollingInterval]: [boolean, number] =
        this.ruleCache.updateTargets(
          targetDocuments,
          responseObject.LastRuleModification
        );
      this.targetPollingInterval = nextPollingInterval;
      clearInterval(this.targetPoller);
      this.startSamplingTargetsPoller();

      if (refreshSamplingRules) {
        this.samplerDiag.debug(
          'Performing out-of-band sampling rule polling to fetch updated rules.'
        );
        clearInterval(this.rulePoller);
        this.startSamplingRulesPoller();
      }
    } catch (error: unknown) {
      this.samplerDiag.debug('Error occurred when updating Sampling Targets');
    }
  }

  private static generateClientId(): string {
    const hexChars: string[] = [
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ];
    const clientIdArray: string[] = [];
    for (let _ = 0; _ < 24; _ += 1) {
      clientIdArray.push(hexChars[Math.floor(Math.random() * hexChars.length)]);
    }
    return clientIdArray.join('');
  }
}
