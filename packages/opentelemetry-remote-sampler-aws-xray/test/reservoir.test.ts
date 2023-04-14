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
import { Reservoir } from '../src/reservoir';
import { SamplingTargetDocument } from '../src/remote-sampler.types';


describe('Reservoir', () => {

    let clock: sinon.SinonFakeTimers;
    let target: SamplingTargetDocument;

    before(() => {
        clock = sinon.useFakeTimers();
        target = {FixedRate: 0.05, Interval: 5, ReservoirQuota: 5, ReservoirQuotaTTL: 1681262846, RuleName: "testRule"}

    });

    it('should return false in isExpired when the reservoir is expired', () => {
        let expiredReservoir = new Reservoir(10);
        let timeNow = 1500000000; // temp result of Math.floor(new Date().getTime() / 1000);
        
        expiredReservoir.updateReservoir(target);

        assert.equal(expiredReservoir.isExpired(timeNow), false);
    });

    it('should return true in isExpired when the reservoir is expired', () => {
        let expiredReservoir = new Reservoir(10);
        let timeNow = 1681262846; // temp result of Math.floor(new Date().getTime() / 1000);
        
        expiredReservoir.updateReservoir(target);

        assert.equal(expiredReservoir.isExpired(timeNow), true);
    });

    it('should return true in isExpired when the time now === TTL', () => {
        let expiredReservoir = new Reservoir(10);
        let timeNow = 1500000000; // temp result of Math.floor(new Date().getTime() / 1000);
        

        target = {FixedRate: 0.05, Interval: 5, ReservoirQuota: 5, ReservoirQuotaTTL: 1500000000, RuleName: "testRule"}

        expiredReservoir.updateReservoir(target);

        assert.equal(expiredReservoir.isExpired(timeNow), true);
    });

    it('should only borrow 1 request per second', () => {
        let reservoir = new Reservoir(10);
        let timeNow = 1500000000; // temp result of Math.floor(new Date().getTime() / 1000);
        
        let result = reservoir.take(timeNow, true, 1); 
        assert.equal(result, true)

        // try to borrow again in the same second, should return false 
        let result2 = reservoir.take(timeNow, true, 1); 
        assert.equal(result2, false)

        // add 1 second to timeNow 
        timeNow += 1; 
        // should be able to borrow now 
        let result3 = reservoir.take(timeNow, true, 1); 
        assert.equal(result3, true)


    });

    it('should consume from quota when reservoir is expired', () => {
        let reservoir = new Reservoir(10);
        let timeNow = 1500000000; // temp result of Math.floor(new Date().getTime() / 1000);
        let target = {FixedRate: 0.05, Interval: 5, ReservoirQuota: 2, ReservoirQuotaTTL: 1681262846, RuleName: "testRule"}

        reservoir.updateReservoir(target);
        
        let result = reservoir.take(timeNow, true, 1); 
        assert.equal(result, true)

        // try to borrow again in the same second, should return false 
        let result2 = reservoir.take(timeNow, true, 1); 
        assert.equal(result2, false)

        // add 1 second to timeNow 
        timeNow += 1; 
        // should be able to borrow now 
        let result3 = reservoir.take(timeNow, true, 1); 
        assert.equal(result3, true)

        timeNow += 1 
        let result4 = reservoir.take(timeNow, false, 1); 
        assert.equal(result4, true)

        let result5 = reservoir.take(timeNow, false, 1); 
        assert.equal(result5, true)

        let result6 = reservoir.take(timeNow, false, 1); 
        assert.equal(result6, false)
    });

    it('should refresh quotaBalance every second', () => {
        let reservoir = new Reservoir(100);
        let timeNow = 1500000000; // temp result of Math.floor(new Date().getTime() / 1000);
        let target = {FixedRate: 0.05, Interval: 5, ReservoirQuota: 2, ReservoirQuotaTTL: 1681262846, RuleName: "testRule"}

        reservoir.updateReservoir(target);
        
        // quotaBalance starts out as 0
        assert.equal(reservoir.getQuotaBalance(), 0);

        assert.equal(reservoir.take(timeNow, false, 1), true);

        assert.equal(reservoir.getQuotaBalance(), 1);

        assert.equal(reservoir.take(timeNow, false, 1), true);
        assert.equal(reservoir.getQuotaBalance(), 0);

        // once quota is consumed (=0) the reservoir does not allow for consuming 
        // any items again within the same second 
        assert.equal(reservoir.take(timeNow, false, 1), false);

        timeNow += 1; 

        // quotaBalance is updated after one second has passed
        assert.equal(reservoir.getQuotaBalance(), 0);
        assert.equal(reservoir.take(timeNow, false, 1), true);

        assert.equal(reservoir.getQuotaBalance(), 1);

        assert.equal(reservoir.take(timeNow, false, 1), true);
        assert.equal(reservoir.getQuotaBalance(), 0);

        // once quota is consumed (=0) the reservoir does not allow for consuming 
        // any items again within the same second 
        assert.equal(reservoir.take(timeNow, false, 1), false);


        timeNow += 4 
        // reservoir updates the quotaBalance with one second worth of quota (even though 4 seconds have passed) and allows to consume
        assert.equal(reservoir.getQuotaBalance(), 0);
        assert.equal(reservoir.take(timeNow, false, 1), true);

        assert.equal(reservoir.getQuotaBalance(), 1);
        assert.equal(reservoir.take(timeNow, false, 1), true);
        assert.equal(reservoir.getQuotaBalance(), 0);

    });

    it('should not borrow when reservoirSize is 0', () => {
        let reservoir = new Reservoir(0);
        let timeNow = 1500000000; // temp result of Math.floor(new Date().getTime() / 1000);
        let target = {FixedRate: 0.05, Interval: 5, ReservoirQuota: 0, ReservoirQuotaTTL: 1681262846, RuleName: "testRule"}

        reservoir.updateReservoir(target);

        assert.equal(reservoir.getQuotaBalance(), 0);
        assert.equal(reservoir.take(timeNow, true, 1), false);

        timeNow += 5; 
        assert.equal(reservoir.getQuotaBalance(), 0);
        assert.equal(reservoir.take(timeNow, true, 1), false);

    });

    it('should return false when there is no unused quota remaining', () => {
        let reservoir = new Reservoir(100);
        let timeNow = 1500000000; // temp result of Math.floor(new Date().getTime() / 1000);
        let target = {FixedRate: 0.05, Interval: 5, ReservoirQuota: 5, ReservoirQuotaTTL: 1681262846, RuleName: "testRule"}

        reservoir.updateReservoir(target);

        
        for(let i = 0 ; i < 5;i++) {
           assert.equal(reservoir.take(timeNow, false, 1), true)
        }

        // take should return false since there is no unused quota remaining
        assert.equal(reservoir.take(timeNow, false, 1), false)

    });

    it('should return true when there is unused quota remaining', () => {
        let reservoir = new Reservoir(100);
        let timeNow = 1500000000; // temp result of Math.floor(new Date().getTime() / 1000);
        let target = {FixedRate: 0.05, Interval: 5, ReservoirQuota: 5, ReservoirQuotaTTL: 1681262846, RuleName: "testRule"}

        reservoir.updateReservoir(target);

        
        for(let i = 0 ; i < 5;i++) {
           assert.equal(reservoir.take(timeNow, false, 1), true)
        }

        timeNow += 1

        // take should return true since there is unused quota remaining 
        assert.equal(reservoir.take(timeNow, false, 1), true)

    });

});

