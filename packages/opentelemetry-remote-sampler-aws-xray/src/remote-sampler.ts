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

import { Sampler, SamplingResult } from '@opentelemetry/sdk-trace-base';
import { SamplingRule } from './sampling-rule';
import axios from 'axios';
import { Resource } from '@opentelemetry/resources';
import { RuleCache } from './rule-cache';
import {
    Context,
    Link,
    Attributes,
    SpanKind,
  } from '@opentelemetry/api';
import { FallbackSampler } from './fallback-sampler';

const DEFAULT_INTERVAL = 5 * 60 * 1000;// 5 minutes on sampling rules fetch (default polling interval)


// IN PROGRESS - SKELETON CLASS 
export class AWSXRayRemoteSampler implements Sampler {
    private _pollingInterval: number;
    private _endpoint: string;
    private _samplingRulesEndpoint: string;
    private resource: Resource; 
    private _ruleCache: RuleCache; 
    private _fallBackSampler: FallbackSampler;

    constructor(resource: Resource, endpoint: string = "http://localhost:2000", pollingInterval: number = DEFAULT_INTERVAL) {

        if (pollingInterval <= 0 || !Number.isInteger(pollingInterval)) {
            throw new TypeError('pollingInterval must be a positive integer');
        }

        this._pollingInterval = pollingInterval;
        this._endpoint = endpoint;
        this.resource = resource;
        this._samplingRulesEndpoint = "/GetSamplingRules";
        this._ruleCache = new RuleCache();
        this._fallBackSampler = new FallbackSampler();

        // execute first get Sampling rules update using polling interval
        this.getSamplingRules();
    }

    shouldSample(    
        context: Context,
        traceId: string,
        spanName: string,
        spanKind: SpanKind,
        attributes: Attributes,
        links: Link[]): SamplingResult {
       
        if (this._ruleCache.isExpired()){
            // go to fallback sampler .shouldSample
            return this._fallBackSampler.shouldSample(context, traceId, spanName, spanKind, attributes, links)
        }

        let matchedRule = this._ruleCache.getMatchedRule(attributes, this.resource);

        // TODO: update after verifying if default rule will always match, 
        // this means that this method will always return return { decision: matchedRule.sample(attributes) }
        // as long as the rule cache has not expired. 
        if (matchedRule) {
            return { decision: matchedRule.sample(attributes) }
        }
        
        return this._fallBackSampler.shouldSample(context, traceId, spanName, spanKind, attributes, links)

    }

    toString(): string {
        return `AWSXRayRemoteSampler`;
    }

    getEndpoint(): string {
        return this._endpoint;
    }

    getPollingInterval(): number {
        return this._pollingInterval;
    }


    // fetch sampling rules every polling interval
    public async getSamplingRules(): Promise<void> {
        const endpoint = this._endpoint + this._samplingRulesEndpoint;

        setInterval(async () => {
            const samplingRules: SamplingRule[] = []; // reset rules array

            const headers = {
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            try {
                const response = await axios.post(endpoint, null, headers);
                const responseJson = response.data;

                responseJson?.SamplingRuleRecords.forEach((record: any) => {
                    if (record.SamplingRule) {
                        samplingRules.push(record.SamplingRule);
                    }
                });

                this._ruleCache.updateRules(samplingRules);
            } catch (error) {
                // Log error
                console.log("Error fetching sampling rules: ", error);
            }
        }, this._pollingInterval);

    }

}
