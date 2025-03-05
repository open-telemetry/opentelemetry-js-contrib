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

import { Attributes } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { SamplingRuleApplier } from './sampling-rule-applier';

// The cache expires 1 hour after the last refresh time.
const RULE_CACHE_TTL_MILLIS: number = 60 * 60 * 1000;

export class RuleCache {
  private ruleAppliers: SamplingRuleApplier[];
  private lastUpdatedEpochMillis: number;
  private samplerResource: Resource;

  constructor(samplerResource: Resource) {
    this.ruleAppliers = [];
    this.samplerResource = samplerResource;
    this.lastUpdatedEpochMillis = Date.now();
  }

  public isExpired(): boolean {
    const nowInMillis: number = Date.now();
    return nowInMillis > this.lastUpdatedEpochMillis + RULE_CACHE_TTL_MILLIS;
  }

  public getMatchedRule(
    attributes: Attributes
  ): SamplingRuleApplier | undefined {
    return this.ruleAppliers.find(
      rule =>
        rule.matches(attributes, this.samplerResource) ||
        rule.samplingRule.RuleName === 'Default'
    );
  }

  private sortRulesByPriority(): void {
    this.ruleAppliers.sort(
      (rule1: SamplingRuleApplier, rule2: SamplingRuleApplier): number => {
        if (rule1.samplingRule.Priority === rule2.samplingRule.Priority) {
          return rule1.samplingRule.RuleName < rule2.samplingRule.RuleName
            ? -1
            : 1;
        }
        return rule1.samplingRule.Priority - rule2.samplingRule.Priority;
      }
    );
  }

  public updateRules(newRuleAppliers: SamplingRuleApplier[]): void {
    const oldRuleAppliersMap: { [key: string]: SamplingRuleApplier } = {};

    this.ruleAppliers.forEach((rule: SamplingRuleApplier) => {
      oldRuleAppliersMap[rule.samplingRule.RuleName] = rule;
    });

    newRuleAppliers.forEach((newRule: SamplingRuleApplier, index: number) => {
      const ruleNameToCheck: string = newRule.samplingRule.RuleName;
      if (ruleNameToCheck in oldRuleAppliersMap) {
        const oldRule: SamplingRuleApplier =
          oldRuleAppliersMap[ruleNameToCheck];
        if (newRule.samplingRule.equals(oldRule.samplingRule)) {
          newRuleAppliers[index] = oldRule;
        }
      }
    });
    this.ruleAppliers = newRuleAppliers;

    // sort ruleAppliers by priority and update lastUpdatedEpochMillis
    this.sortRulesByPriority();
    this.lastUpdatedEpochMillis = Date.now();
  }
}
