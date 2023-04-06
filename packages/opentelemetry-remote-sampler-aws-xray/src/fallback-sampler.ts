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

import { Sampler, SamplingResult, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';
import {
    Context,
    Link,
    Attributes,
    SpanKind,
  } from '@opentelemetry/api';

export class FallbackSampler implements Sampler {

    private _alwaysOnSampler = new AlwaysOnSampler();

    shouldSample(    
        context: Context,
        traceId: string,
        spanName: string,
        spanKind: SpanKind,
        attributes: Attributes,
        links: Link[]): SamplingResult {

        // This will be updated to be a rate limiting sampler in the next PR 
        return this._alwaysOnSampler.shouldSample();
    }

    public toString = () : string => {
        return "FallbackSampler"
    }
}