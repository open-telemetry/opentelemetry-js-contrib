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
import { diag } from '@opentelemetry/api';
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
import { SamplingStatisticsDocument, SamplingTargetDocument } from './remote-sampler.types';

const DEFAULT_INTERVAL = 5 * 60 * 1000;// 5 minutes on sampling rules fetch (default polling Interval)
const SAMPLING_TARGETS_ENDPOINT = "/GetSamplingTargets";
const TARGET_POLLING_Interval = 10 * 1000; // default target polling Interval = 10 seconds and is fixed 

// IN PROGRESS - SKELETON CLASS 
export class AWSXRayRemoteSampler implements Sampler {
    private _pollingInterval: number;
    private _endpoint: string;
    private _samplingRulesEndpoint: string;
    private resource: Resource; 
    private _ruleCache: RuleCache; 
    private _fallBackSampler: FallbackSampler;
    private _rulePoller: any;

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

        // execute first get Sampling rules update using polling Interval
        this.getSamplingRules();

        // start Interval for target polling
        this.fetchSamplingTargets();
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
        let now = Math.floor(new Date().getTime() / 1000);
        if (matchedRule) {
            return { decision: matchedRule.sample(context, traceId, now) }
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


    // fetch sampling rules every polling Interval
    public async getSamplingRules(): Promise<void> {
        const endpoint = this._endpoint + this._samplingRulesEndpoint;

        this._rulePoller = setInterval(async () => {
            const samplingRules: SamplingRule[] = []; // reset rules array

            const headers = {
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            try {
                const response = await axios.post(endpoint, {}, headers);
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

    private fetchSamplingTargets = (): void => {
        setInterval(async () => {

            const requestConfig = {
                headers: {
                  'Content-Type': 'application/json',
                },
              };

            try {
                // fetch sampling targets after we have rules in the cache 
                // ensures that /GetSamplingRules was called at least once since this 10s Interval is less than the 
                // default 5 minute Interval for rules. 
                if (this._ruleCache.rules.length > 0) {

                    // convert to format the backend is expecting: 
                    // https://docs.aws.amazon.com/xray/latest/api/API_GetSamplingTargets.html#xray-GetSamplingTargets-request-SamplingStatisticsDocuments
                    const requestBody = {SamplingStatisticsDocument: this._ruleCache.createSamplingStatisticsDocuments()}; 
                    
                    const response = await axios.post(this._endpoint + SAMPLING_TARGETS_ENDPOINT, requestBody, requestConfig);
                    const responseJson = response.data; 

                    let targetDocuments: any = {};

                    // parse targets response 
                    responseJson?.SamplingTargetDocuments.forEach((target: SamplingTargetDocument) => {

                        let newTarget: SamplingTargetDocument = {
                            FixedRate: target.FixedRate, 
                            ReservoirQuota: target.ReservoirQuota, 
                            ReservoirQuotaTTL: target.ReservoirQuotaTTL, 
                            Interval: target.Interval, 
                            RuleName: target.RuleName
                        }

                        targetDocuments[target.RuleName] = newTarget;
                    })

                    // update targets in the cache
                    let refreshSamplingRules = this._ruleCache.updateTargets(targetDocuments, responseJson.UnprocessedStatistics)

                    let ruleFreshness = responseJson.lastRuleModification;

                    if(refreshSamplingRules || (this._ruleCache.lastUpdated && (ruleFreshness > this._ruleCache.lastUpdated))) {
                        diag.info("Performing out-of-band sampling rule polling to fetch updated rules.");

                        // clear initial Interval 
                        clearInterval(this._rulePoller);

                        // re-start sampling rules fetch 
                        this.getSamplingRules();
                    }

                }
               
            } catch (error){
                diag.warn("Error fetching sampling targets: ", error)
            }
        }, TARGET_POLLING_Interval + (0.01 * TARGET_POLLING_Interval)) // + 1% of Interval for jitter
    }

}
