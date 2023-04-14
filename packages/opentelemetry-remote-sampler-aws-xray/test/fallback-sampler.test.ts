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

import * as assert from 'assert';
import * as sinon from 'sinon';
import { Sampler, SamplingResult, TraceIdRatioBasedSampler, SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { ROOT_CONTEXT, SpanKind, TraceFlags, trace } from '@opentelemetry/api';
import { FallbackSampler } from '../src/fallback-sampler';

describe('FallbackSampler', () => {

    // similar to https://github.com/open-telemetry/opentelemetry-js/blob/df58facddefe70d90006cced5137ffc837b5e908/packages/opentelemetry-sdk-trace-base/test/common/sampler/ParentBasedSampler.test.ts#L26-L28
    const testTraceId = 'd4cda95b652f4a1592b449d5929fda1b';
    const testSpanId = '6e0c63257de34c92';
    const testSpanName = 'testSpanName';

    let fallbackSampler: FallbackSampler;
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
        clock = sinon.useFakeTimers();
        fallbackSampler = new FallbackSampler(); 
    })

    afterEach(() => {
        clock.restore();
    })

    it('should be initialized with ratio of 0.05 and quotaBalance of 1.0', () => {

        assert.strictEqual(fallbackSampler.toString(), "FallbackSampler(ratio=0.05, quotaBalance=1)");
    });

    it('should return a RECORD_AND_SAMPLED sampling decision upon initialization', () => {

        const spanContext = {
            traceId: testTraceId,
            spanId: testSpanId,
            traceFlags: TraceFlags.NONE,
          };

        assert.deepStrictEqual(fallbackSampler.shouldSample(trace.setSpanContext(ROOT_CONTEXT, spanContext), testTraceId, testSpanName, SpanKind.CLIENT, {}, []), { decision: SamplingDecision.RECORD_AND_SAMPLED } );
    });

    it('should only borrow 1 request every second', () => {
        // TODO: check if time should be in milliseconds or seconds 

        // let timeNow = Math.floor(new Date().getTime() / 1000);

        let timeNow = 1681262846; // temp result of Math.floor(new Date().getTime() / 1000);
        console.log("timenow in test????=", timeNow)

        let borrowed = fallbackSampler.take(timeNow, 1.0);
        assert.equal(borrowed, true)

        let borrowedAgainInTheSameSecond = fallbackSampler.take(timeNow, 1.0)
        assert.equal(borrowedAgainInTheSameSecond, false)

        let borrowedAfterOneSecond = fallbackSampler.take(timeNow + 1, 1.0) // add 1 second
        assert.equal(borrowedAfterOneSecond, true)


    });

    it('should have quotaBalance close to 1 after time has elapsed', () => {
        // TODO: check if time should be in milliseconds or seconds 

        // let timeNow = Math.floor(new Date().getTime() / 1000);

        let timeNow = 1681262846; // temp result of Math.floor(new Date().getTime() / 1000);

        let borrowed = fallbackSampler.take(timeNow, 1.0);
        assert.equal(borrowed, true)

        let secondBorrow = fallbackSampler.take(timeNow + 9, 1.0)
        assert.equal(secondBorrow, true)
        assert.equal(fallbackSampler._quotaBalance, 0)

    });


});


