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

import { SamplingTargetDocument } from "./remote-sampler.types";

/**
 * The reservoir keeps track of the number of traces per second sampled and
 * the fixed rate for a given sampling rule. This information is fetched from X-Ray serivce.
 * It decides if a given trace should be borrowed or sampled or not sampled based on the state of current second.
 */
export class Reservoir {
     // Quota assigned to client to consume per second.
    public _quota: number;
    public _TTL: number; 
    public _interval: number | undefined;
    // Size of the reservoir from the Sampling Rule  
    private _reservoirSize: number;
    private _lastTick: number; 

    // Current balance of quota.
    private _quotaBalance: number = 0; 

    constructor (reservoirSize: number) {
        this._reservoirSize = reservoirSize;
        this._quota = 0; // TODO: check initial values
        this._TTL = 0; 
        this._interval = undefined; 
        this._lastTick = 0;
        this._quotaBalance = 0;
    }

    public getQuotaBalance = (): number => {
        return this._quotaBalance;
    }

    // take consumes quota from reservoir, if any remains, then returns true. 
    // False otherwise.

    public take = (now: any, borrowed: boolean, itemCost: any) : boolean => {
        if (this._reservoirSize === 0) return false 

        if (this._lastTick === 0) {
            this._lastTick = now; 


            if (borrowed){
                this._quotaBalance = 1;
            } else {
                this._quotaBalance = this._quota;
            }
        }
        console.log(`quotaBalance: ${this._quotaBalance}, itemCost: ${itemCost}`)
        if (this._quotaBalance >= itemCost){
            this._quotaBalance -= itemCost;
            return true; 
        }

        // update quota balance based on elapsed time 
        this.updateQuotaBalance(now, borrowed);
        console.log(`UPDATED quotaBalance: ${this._quotaBalance}, itemCost: ${itemCost}`)

        if (this._quotaBalance >= itemCost){
            this._quotaBalance -= itemCost;
            return true; 
        }

        return false; 
    }

    public updateQuotaBalance = (now: number, borrowed: boolean) => {
        let elapsedTime = now - this._lastTick; 

         // update lastTick
        this._lastTick = now; 

        // calculated how much credit has accumulated since the last tick 
        if(borrowed) {
            if(elapsedTime > 1) {// in seconds 
                this._quotaBalance += 1; 
            } else {
                this._quotaBalance += elapsedTime; 
            }
        } else {
            this._quotaBalance += elapsedTime * this._quota;

            if(this._quotaBalance > this._quota) {
                this._quotaBalance = this._quota
            }
        }
    }


    public updateReservoir = (target: SamplingTargetDocument): void => {
        // updates the reservoir for the rule based on the targets retreived

        // Using if statements because attributes are optional 
        if (target.ReservoirQuota) this._quota = target.ReservoirQuota; 
        if (target.ReservoirQuotaTTL) this._TTL = target.ReservoirQuotaTTL; 
        if (target.Interval) this._interval = target.Interval;
    }

    public isExpired = (now: number) => {
        return now >= this._TTL;
    }

}