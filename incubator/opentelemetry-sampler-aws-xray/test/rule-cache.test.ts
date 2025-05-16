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

// Includes work from:
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { emptyResource } from '@opentelemetry/resources';
import { expect } from 'expect';
import * as sinon from 'sinon';
import { RuleCache } from '../src/rule-cache';
import { SamplingRule } from '../src/sampling-rule';
import { SamplingRuleApplier } from '../src/sampling-rule-applier';

const createRule = (
  name: string,
  priority: number,
  reservoirSize: number,
  fixedRate: number
): SamplingRuleApplier => {
  const testSamplingRule = {
    RuleName: name,
    Priority: priority,
    ReservoirSize: reservoirSize,
    FixedRate: fixedRate,
    ServiceName: '*',
    ServiceType: '*',
    Host: '*',
    HTTPMethod: '*',
    URLPath: '*',
    ResourceARN: '*',
    Version: 1,
  };
  return new SamplingRuleApplier(new SamplingRule(testSamplingRule));
};

describe('RuleCache', () => {
  it('testCacheUpdatesAndSortsRules', () => {
    // Set up default rule in rule cache
    const defaultRule = createRule('Default', 10000, 1, 0.05);
    const cache = new RuleCache(emptyResource());
    cache.updateRules([defaultRule]);

    // Expect default rule to exist
    expect(cache['ruleAppliers'].length).toEqual(1);

    // Set up incoming rules
    const rule1 = createRule('low', 200, 0, 0.0);
    const rule2 = createRule('abc', 100, 0, 0.0);
    const rule3 = createRule('Abc', 100, 0, 0.0);
    const rule4 = createRule('ab', 100, 0, 0.0);
    const rule5 = createRule('A', 100, 0, 0.0);
    const rule6 = createRule('high', 10, 0, 0.0);
    const rules = [rule1, rule2, rule3, rule4, rule5, rule6];

    cache.updateRules(rules);

    // Default rule should be removed because it doesn't exist in the new list
    expect(cache['ruleAppliers'].length).toEqual(rules.length);
    expect(cache['ruleAppliers'][0].samplingRule.RuleName).toEqual('high');
    expect(cache['ruleAppliers'][1].samplingRule.RuleName).toEqual('A');
    expect(cache['ruleAppliers'][2].samplingRule.RuleName).toEqual('Abc');
    expect(cache['ruleAppliers'][3].samplingRule.RuleName).toEqual('ab');
    expect(cache['ruleAppliers'][4].samplingRule.RuleName).toEqual('abc');
    expect(cache['ruleAppliers'][5].samplingRule.RuleName).toEqual('low');
  });

  it('testRuleCacheExpirationLogic', () => {
    const clock = sinon.useFakeTimers(Date.now());

    const defaultRule = createRule('Default', 10000, 1, 0.05);
    const cache = new RuleCache(emptyResource());
    cache.updateRules([defaultRule]);

    clock.tick(2 * 60 * 60 * 1000);

    expect(cache.isExpired()).toBe(true);
    clock.restore();
  });

  it('testUpdateCacheWithOnlyOneRuleChanged', () => {
    // Set up default rule in rule cache
    const cache = new RuleCache(emptyResource());
    const rule1 = createRule('rule_1', 1, 0, 0.0);
    const rule2 = createRule('rule_2', 10, 0, 0.0);
    const rule3 = createRule('rule_3', 100, 0, 0.0);
    const ruleAppliers = [rule1, rule2, rule3];

    cache.updateRules(ruleAppliers);

    const ruleAppliersCopy = cache['ruleAppliers'];

    const newRule3 = createRule('new_rule_3', 5, 0, 0.0);
    const newRuleAppliers = [rule1, rule2, newRule3];
    cache.updateRules(newRuleAppliers);

    // Check rule cache is still correct length and has correct rules
    expect(cache['ruleAppliers'].length).toEqual(3);
    expect(cache['ruleAppliers'][0].samplingRule.RuleName).toEqual('rule_1');
    expect(cache['ruleAppliers'][1].samplingRule.RuleName).toEqual(
      'new_rule_3'
    );
    expect(cache['ruleAppliers'][2].samplingRule.RuleName).toEqual('rule_2');

    // Assert before and after of rule cache
    expect(ruleAppliersCopy[0]).toEqual(cache['ruleAppliers'][0]);
    expect(ruleAppliersCopy[1]).toEqual(cache['ruleAppliers'][2]);
    expect(ruleAppliersCopy[2]).not.toEqual(cache['ruleAppliers'][1]);
  });

  it('testUpdateRulesRemovesOlderRule', () => {
    // Set up default rule in rule cache
    const cache = new RuleCache(emptyResource());
    expect(cache['ruleAppliers'].length).toEqual(0);

    const rule1 = createRule('first_rule', 200, 0, 0.0);
    const rules = [rule1];
    cache.updateRules(rules);
    expect(cache['ruleAppliers'].length).toEqual(1);
    expect(cache['ruleAppliers'][0].samplingRule.RuleName).toEqual(
      'first_rule'
    );

    const replacement_rule1 = createRule('second_rule', 200, 0, 0.0);
    const replacementRules = [replacement_rule1];
    cache.updateRules(replacementRules);
    expect(cache['ruleAppliers'].length).toEqual(1);
    expect(cache['ruleAppliers'][0].samplingRule.RuleName).toEqual(
      'second_rule'
    );
  });

  // TODO: Add tests for updating Sampling Targets and getting statistics
});
