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

import { Sampler, SamplingDecision, SamplingResult } from '@opentelemetry/sdk-trace-base';
import { SamplingRule } from './remote-sampler.types';
import axios from 'axios';

const DEFAULT_INTERVAL = 5 * 60 * 1000;// 5 minutes on sampling rules fetch (default polling interval)


// IN PROGRESS - SKELETON CLASS 
export class AWSXRayRemoteSampler implements Sampler {
    private _pollingInterval: number;
    private _endpoint: string;
    private _samplingRulesEndpoint: string;

    constructor(endpoint: string, pollingInterval: number = DEFAULT_INTERVAL) {

        if (pollingInterval <= 0 || !Number.isInteger(pollingInterval)) {
            throw new TypeError('pollingInterval must be a positive integer');
        }

        this._pollingInterval = pollingInterval;
        this._endpoint = endpoint;
        this._samplingRulesEndpoint = "/GetSamplingRules";

        // execute first get Sampling rules update using polling interval
        this.getSamplingRules();
    }

    shouldSample(): SamplingResult {
        // Implementation to be added
        return { decision: SamplingDecision.NOT_RECORD };
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
            } catch (error) {
                // Log error
                console.log("Error fetching sampling rules: ", error);
            }
        }, this._pollingInterval);

    }

}
