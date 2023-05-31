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
import { SamplingRule } from './sampling-rule';
import { Attributes } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';

const RuleCacheTTL_SECONDS = 60 * 60; // The cache expires 1 hour after the last refresh time. (in seconds)

export class RuleCache {
  public rules: SamplingRule[];
  private lastUpdated: number | undefined = undefined;

  constructor() {
    this.rules = [];
  }

  public isExpired = (): boolean => {
    if (this.lastUpdated === undefined) {
      return true;
    }

    const now = Math.floor(new Date().getTime() / 1000); // getTime returns milliseconds -> /1000 gives seconds
    return now > this.lastUpdated + RuleCacheTTL_SECONDS;
  };

  public getMatchedRule = (
    attributes: Attributes,
    resource: Resource
  ): SamplingRule | undefined => {
    if (this.isExpired()) {
      return undefined;
    }

    return this.rules.find(
      rule => rule.matches(attributes, resource) || rule.RuleName === 'Default'
    );
  };

  private _sortRulesByPriority = () => {
    this.rules.sort((rule1: SamplingRule, rule2: SamplingRule): number => {
      const value = rule1.Priority - rule2.Priority;

      if (value !== 0) return value;

      if (rule1.RuleName > rule2.RuleName) {
        return 1;
      } else return -1;
    });
  };

  public updateRules = (newRules: SamplingRule[]): void => {
    // store previous rules
    const oldRules: { [key: string]: SamplingRule } = {};

    this.rules.forEach((rule: SamplingRule) => {
      // use Object.assign to create a new copy of the rules object to store by value
      oldRules[rule.RuleName] = Object.assign({}, rule);
    });

    // update rules in the cache
    this.rules = newRules;

    this.rules.forEach((rule: SamplingRule) => {
      const oldRule: SamplingRule = oldRules[rule.RuleName];

      if (oldRule) {
        rule.reservoir = oldRule.reservoir;
        rule.statistics = oldRule.statistics;
      }
    });

    // sort rules by priority and make lastUpdated = now
    this._sortRulesByPriority();
    this.lastUpdated = Math.floor(new Date().getTime() / 1000);

    return;
  };
}
