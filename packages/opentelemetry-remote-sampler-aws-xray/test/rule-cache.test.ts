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
import { SamplingRule } from "../src/sampling-rule";
import { Resource } from '@opentelemetry/resources';
import { Reservoir } from '../src/reservoir';
import { RuleCache } from '../src/rule-cache';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { SamplingStatisticsDocument, SamplingTargetDocument } from '../src/remote-sampler.types';


const createRule = (name: string, priority: number, reservoirSize: number, FixedRate: number): SamplingRule => {
    return new SamplingRule(name, priority, reservoirSize, FixedRate, "*", "*", "*", "*", "*", "*", 1)
}

describe('RuleCache', () => {

    it('should update rules in the cache', () => {
        let defaultRule: SamplingRule = createRule("Default", 10000, 1, 0.05)
        defaultRule.reservoir = new Reservoir(20);

        let ruleCache = new RuleCache();
        ruleCache.rules = [defaultRule];

        let newDefaultRule: SamplingRule = createRule('Default', 10000, 10, 0.20)
        ruleCache.updateRules([newDefaultRule]);

        assert.equal(ruleCache.rules[0].RuleName, 'Default')
        assert.equal(ruleCache.rules[0].ReservoirSize, 10)
        assert.equal(ruleCache.rules[0].FixedRate, 0.20)

    });

    it('should remove the old rule from the cache after updating', () => {
        let defaultRule: SamplingRule = createRule("Default", 10000, 1, 0.05)
        defaultRule.reservoir = new Reservoir(20);

        let ruleCache = new RuleCache();
        ruleCache.rules = [defaultRule];

        let newDefaultRule: SamplingRule = createRule('Default', 10000, 10, 0.20)
        ruleCache.updateRules([newDefaultRule]);

        assert.equal(ruleCache.rules.length, 1)

    });

    it('should sort the rules based on priority', () => {
        let ruleCache = new RuleCache();

        const defaultRule: SamplingRule = createRule("Default", 10000, 1, 0.05) // priority = 10000
        const rule1: SamplingRule = createRule("Rule1", 100, 5, 0.20) // priority = 100
        const rule2: SamplingRule = createRule("Rule2", 1, 10, 0.20) // priority = 1

        ruleCache.updateRules([defaultRule, rule1, rule2]);

        assert.equal(ruleCache.rules.length, 3)
        assert.equal(ruleCache.rules[0].RuleName, "Rule2")
        assert.equal(ruleCache.rules[1].RuleName, "Rule1")
        assert.equal(ruleCache.rules[2].RuleName, "Default")

    });

    it('should match with the rule with the higher priority', () => {
        let ruleCache = new RuleCache();
        const attributes = {}
        const resource = new Resource({[SemanticResourceAttributes.SERVICE_NAME]: "aws_ec2"})

        const defaultRule: SamplingRule = createRule("Default", 10000, 1, 0.05) // priority = 10000
        const rule1: SamplingRule = createRule("Rule1", 100, 5, 0.20) // priority = 100
        const rule2: SamplingRule = createRule("Rule2", 1, 10, 0.20) // priority = 1

        ruleCache.updateRules([defaultRule, rule1, rule2]); 
        
        let matchedRule = ruleCache.getMatchedRule(attributes, resource);
        assert.equal(matchedRule?.RuleName, "Rule2")
    });

    it('should match with the first rule if more than 1 rule have the same priority', () => {
        let ruleCache = new RuleCache();
        const attributes = {}
        const resource = new Resource({[SemanticResourceAttributes.SERVICE_NAME]: "aws_ec2"})

        const defaultRule: SamplingRule = createRule("Default", 10000, 1, 0.05) // priority = 10000
        const rule1: SamplingRule = createRule("Rule1", 1, 5, 0.20) // priority = 1
        const rule2: SamplingRule = createRule("Rule2", 1, 10, 0.20) // priority = 1

        ruleCache.updateRules([defaultRule, rule1, rule2]);

        let matchedRule = ruleCache.getMatchedRule(attributes, resource);
        assert.equal(matchedRule?.RuleName, "Rule1") // alphabetical order
    });

    const targetsResponse = {
        "LastRuleModification": 17000000,
        "SamplingTargetDocuments": [ 
           { 
              "FixedRate": 0.06,
              "Interval": 25,
              "ReservoirQuota": 23,
              "ReservoirQuotaTTL": 15000000,
              "RuleName": "Rule1"
           }
        ],
        "UnprocessedStatistics": [ 
           { 
              "ErrorCode": "200",
              "Message": "Ok",
              "RuleName": "Rule1"
           }, 
           { 
            "ErrorCode": "400",
            "Message": "Bad Request",
            "RuleName": "Rule2"
            }, 
        ]
     }

    const parseTargets = () => {
        // parse targets response 
        let targetDocuments: any = {}; 
        targetsResponse.SamplingTargetDocuments.forEach((target: SamplingTargetDocument) => {

            let newTarget: SamplingTargetDocument = {
                FixedRate: target.FixedRate, 
                ReservoirQuota: target.ReservoirQuota, 
                ReservoirQuotaTTL: target.ReservoirQuotaTTL, 
                Interval: target.Interval, 
                RuleName: target.RuleName
            }

            targetDocuments[target.RuleName] = newTarget;
        })

        return targetDocuments;
    }

    it("should update a rule's reservoir & fixed rate when updateTargets is called", () => {
        let ruleCache = new RuleCache();

        const defaultRule: SamplingRule = createRule("Default", 10000, 1, 0.05) // priority = 10000
        const rule1: SamplingRule = createRule("Rule1", 1, 5, 0.20) // priority = 1
        const rule2: SamplingRule = createRule("Rule2", 1, 10, 0.20) // priority = 1

        ruleCache.updateRules([defaultRule, rule1, rule2]);

        let targets = parseTargets();

        ruleCache.updateTargets(targets, targetsResponse.UnprocessedStatistics);

        assert.equal(rule1.reservoir._quota, 23)
        assert.equal(rule1.reservoir._TTL, 15000000)
        assert.equal(rule1.reservoir._interval, 25)
        assert.equal(rule1.FixedRate, 0.06)



    })

    it("should return true for updateTargets when unprocessedStatistics contains a 4xx error", () => {
        let ruleCache = new RuleCache();

        const defaultRule: SamplingRule = createRule("Default", 10000, 1, 0.05) // priority = 10000
        const rule1: SamplingRule = createRule("Rule1", 1, 5, 0.20) // priority = 1
        const rule2: SamplingRule = createRule("Rule2", 1, 10, 0.20) // priority = 1

        ruleCache.updateRules([defaultRule, rule1, rule2]);

        let targets = parseTargets();

        let result = ruleCache.updateTargets(targets, targetsResponse.UnprocessedStatistics);

        assert.equal(result, true)

    })

});




