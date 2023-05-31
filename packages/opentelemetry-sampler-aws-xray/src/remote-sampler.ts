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

import {
  Sampler,
  SamplingResult,
} from '@opentelemetry/sdk-trace-base';
import {
  diag,
  DiagLogger,
  Context,
  Link,
  Attributes,
  SpanKind,
} from '@opentelemetry/api';
import { SamplingRule } from './sampling-rule';
import { Resource } from '@opentelemetry/resources';
import { AWSXRaySamplerConfig, SamplingRuleRecord } from './types';
import axios from 'axios';
import { RuleCache } from './rule-cache';
import { FallbackSampler } from './fallback-sampler';

// 5 minute interval on sampling rules fetch (default polling interval)
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
// Default endpoint for awsproxy : https://aws-otel.github.io/docs/getting-started/remote-sampling#enable-awsproxy-extension
const DEFAULT_AWS_PROXY_ENDPOINT = 'http://localhost:2000';
const SAMPLING_RULES_PATH = '/GetSamplingRules';

// IN PROGRESS - SKELETON CLASS
export class AWSXRayRemoteSampler implements Sampler {
  private _pollingInterval: number;
  private _awsProxyEndpoint: string;
  private _resource: Resource;
  private _ruleCache: RuleCache;
  private _fallBackSampler: FallbackSampler;
  private _samplerDiag: DiagLogger;

  constructor(samplerConfig: AWSXRaySamplerConfig) {
    this._pollingInterval =
      samplerConfig.pollingIntervalMs ?? DEFAULT_INTERVAL_MS;
    this._awsProxyEndpoint = samplerConfig.endpoint
      ? samplerConfig.endpoint
      : DEFAULT_AWS_PROXY_ENDPOINT;
    this._resource = samplerConfig.resource;
    this._ruleCache = new RuleCache();
    this._fallBackSampler = new FallbackSampler();

    if (this._pollingInterval <= 0) {
      throw new TypeError('pollingInterval must be a positive integer');
    }

    this._samplerDiag = diag.createComponentLogger({
      namespace: '@opentelemetry/sampler-aws-xray',
    });

    // execute first get Sampling rules update using polling interval
    this.startRulePoller();
  }

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    if (this._ruleCache.isExpired()) {
      // go to fallback sampler .shouldSample
      return this._fallBackSampler.shouldSample(
        context,
        traceId,
        spanName,
        spanKind,
        attributes,
        links
      );
    }

    const matchedRule = this._ruleCache.getMatchedRule(
      attributes,
      this._resource
    );

    // TODO: update after verifying if default rule will always match,
    // this means that this method will always return return { decision: matchedRule.sample(attributes) }
    // as long as the rule cache has not expired.
    if (matchedRule) {
      return { decision: matchedRule.sample(attributes) };
    }

    return this._fallBackSampler.shouldSample(
      context,
      traceId,
      spanName,
      spanKind,
      attributes,
      links
    );
  }

  toString(): string {
    return `AWSXRayRemoteSampler{endpoint=${this._awsProxyEndpoint}, pollingInterval=${this._pollingInterval}}`;
  }

  private getAndUpdateSamplingRules = async (): Promise<void> => {
    let samplingRules: SamplingRule[] = []; // reset rules array

    const requestConfig = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    try {
      const samplingRulesEndpoint =
        this._awsProxyEndpoint + SAMPLING_RULES_PATH;
      const response = await axios.post(
        samplingRulesEndpoint,
        {},
        requestConfig
      );
      const responseJson = response.data;

      samplingRules =
        responseJson?.SamplingRuleRecords.map(
          (record: SamplingRuleRecord) => new SamplingRule(record.SamplingRule)
        ).filter(Boolean) ?? [];

      this._ruleCache.updateRules(samplingRules);
    } catch (error) {
      // Log error
      this._samplerDiag.warn('Error fetching sampling rules: ', error);
    }
  };

  // fetch sampling rules every polling interval
  private startRulePoller(): void {
    // execute first update
    // this.getAndUpdateSamplingRules() never rejects. Using void operator to suppress @typescript-eslint/no-floating-promises.
    void this.getAndUpdateSamplingRules();
    // Update sampling rules every 5 minutes (or user-defined polling interval)
    const rulePoller = setInterval(
      () => this.getAndUpdateSamplingRules(),
      this._pollingInterval
    );
    rulePoller.unref();
  }
}
