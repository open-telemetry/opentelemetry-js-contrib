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

import { Sampler, SamplingResult, TraceIdRatioBasedSampler, SamplingDecision } from '@opentelemetry/sdk-trace-base';
import {
    Context,
    Link,
    Attributes,
    SpanKind,
  } from '@opentelemetry/api';

export class FallbackSampler implements Sampler {

    private _traceIdRatioBasedSampler: TraceIdRatioBasedSampler;
    public _quotaBalance: number; 
    private _lastTick: number; 

    constructor() {
        // FallbackSampler samples 1 req/sec and additional 5% of requests using traceIDRatioBasedSampler.
        this._traceIdRatioBasedSampler = new TraceIdRatioBasedSampler(0.05);
        this._quotaBalance = 1.0; // TODO: remove underscore from name
        this._lastTick = 0; 
    }

    // shouldSample implements the logic of borrowing 1 req/sec and then use traceIDRatioBasedSampler to sample 5% of additional requests.
    shouldSample(    
        context: Context,
        traceId: string,
        spanName: string,
        spanKind: SpanKind,
        attributes: Attributes,
        links: Link[]): SamplingResult {

        // first borrow 1 req/sec
        if(this.take(Math.floor(new Date().getTime() / 1000), 1.0)) {
            return { decision: SamplingDecision.RECORD_AND_SAMPLED };
        }

        // TraceIdRatioBasedSampler will sample 5% of additional requests every second. 
        return this._traceIdRatioBasedSampler.shouldSample(context, "traceId");
    }

    public toString = () : string => {
        return `FallbackSampler(ratio=0.05, quotaBalance=${this._quotaBalance})`
    }

    private refreshQuotaBalance = (timeNow: number): void => {
        let elapsedTime = timeNow - this._lastTick; 

        // update lastTick
        this._lastTick = timeNow; 

        if (elapsedTime > 1) {
            this._quotaBalance += 1 
        } else {
            this._quotaBalance += elapsedTime;
        }
    }

    // take consumes quota from reservoir, if any remains, then returns true. False otherwise.
    public take = (timeNow: number, itemCost: number) : boolean =>  {

        if(this._lastTick === 0) {
            this._lastTick = timeNow;
        }

        if (this._quotaBalance >= itemCost) {
            this._quotaBalance -= itemCost;
            return true; 
        }

        this.refreshQuotaBalance(timeNow);

        if (this._quotaBalance >= itemCost) {
            this._quotaBalance -= itemCost;
            return true; 
        }

        return false; 
    }
}