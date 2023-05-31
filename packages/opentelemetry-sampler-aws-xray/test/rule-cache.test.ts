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
import { SamplingRule } from '../src/sampling-rule';
import { Resource } from '@opentelemetry/resources';
import { Reservoir } from '../src/reservoir';
import { RuleCache } from '../src/rule-cache';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const createRule = (
  name: string,
  priority: number,
  reservoirSize: number,
  fixedRate: number
): SamplingRule => {
  const testSamplingRule = {
    ruleName: name,
    priority: priority,
    reservoirSize: reservoirSize,
    fixedRate: fixedRate,
    serviceName: '*',
    serviceType: '*',
    host: '*',
    httpMethod: '*',
    urlPath: '*',
    resourceARN: '*',
    version: 1,
  };
  return new SamplingRule(testSamplingRule);
};

describe('RuleCache', () => {
  it('should update rules in the cache', () => {
    const defaultRule: SamplingRule = createRule('Default', 10000, 1, 0.05);
    defaultRule.reservoir = new Reservoir(20);

    const ruleCache = new RuleCache();
    ruleCache.rules = [defaultRule];

    const newDefaultRule: SamplingRule = createRule('Default', 10000, 10, 0.2);
    ruleCache.updateRules([newDefaultRule]);
    console.log(ruleCache.rules[0]);
    assert.equal(ruleCache.rules[0].RuleName, 'Default');
    assert.equal(ruleCache.rules[0].ReservoirSize, 10);
    assert.equal(ruleCache.rules[0].FixedRate, 0.2);
  });

  it('should remove the old rule from the cache after updating', () => {
    const defaultRule: SamplingRule = createRule('Default', 10000, 1, 0.05);
    defaultRule.reservoir = new Reservoir(20);

    const ruleCache = new RuleCache();
    ruleCache.rules = [defaultRule];

    const newDefaultRule: SamplingRule = createRule('Default', 10000, 10, 0.2);
    ruleCache.updateRules([newDefaultRule]);

    assert.equal(ruleCache.rules.length, 1);
  });

  it('should sort the rules based on priority', () => {
    const ruleCache = new RuleCache();

    const defaultRule: SamplingRule = createRule('Default', 10000, 1, 0.05); // priority = 10000
    const rule1: SamplingRule = createRule('Rule1', 100, 5, 0.2); // priority = 100
    const rule2: SamplingRule = createRule('Rule2', 1, 10, 0.2); // priority = 1

    ruleCache.updateRules([defaultRule, rule1, rule2]);

    assert.equal(ruleCache.rules.length, 3);
    assert.equal(ruleCache.rules[0].RuleName, 'Rule2');
    assert.equal(ruleCache.rules[1].RuleName, 'Rule1');
    assert.equal(ruleCache.rules[2].RuleName, 'Default');
  });

  it('should match with the rule with the higher priority', () => {
    const ruleCache = new RuleCache();
    const attributes = {};
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'aws_ec2',
    });

    const defaultRule: SamplingRule = createRule('Default', 10000, 1, 0.05); // priority = 10000
    const rule1: SamplingRule = createRule('Rule1', 100, 5, 0.2); // priority = 100
    const rule2: SamplingRule = createRule('Rule2', 1, 10, 0.2); // priority = 1

    ruleCache.updateRules([defaultRule, rule1, rule2]);

    const matchedRule = ruleCache.getMatchedRule(attributes, resource);
    assert.equal(matchedRule?.RuleName, 'Rule2');
  });

  it('should match with the first rule if more than 1 rule have the same priority', () => {
    const ruleCache = new RuleCache();
    const attributes = {};
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'aws_ec2',
    });

    const defaultRule: SamplingRule = createRule('Default', 10000, 1, 0.05); // priority = 10000
    const rule1: SamplingRule = createRule('Rule1', 1, 5, 0.2); // priority = 1
    const rule2: SamplingRule = createRule('Rule2', 1, 10, 0.2); // priority = 1

    ruleCache.updateRules([defaultRule, rule1, rule2]);

    const matchedRule = ruleCache.getMatchedRule(attributes, resource);
    assert.equal(matchedRule?.RuleName, 'Rule1'); // alphabetical order
  });
});
