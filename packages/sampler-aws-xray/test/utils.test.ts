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

import { expect } from 'expect';
import * as Utils from '../src/utils';

const positiveTests: any = [
  ['*', ''],
  ['foo', 'foo'],
  ['foo*bar*?', 'foodbaris'],
  ['?o?', 'foo'],
  ['*oo', 'foo'],
  ['foo*', 'foo'],
  ['*o?', 'foo'],
  ['*', 'boo'],
  ['', ''],
  ['a', 'a'],
  ['*a', 'a'],
  ['*a', 'ba'],
  ['a*', 'a'],
  ['a*', 'ab'],
  ['a*a', 'aa'],
  ['a*a', 'aba'],
  ['a*a*', 'aaaaaaaaaaaaaaaaaaaaaaa'],
  [
    'a*b*a*b*a*b*a*b*a*',
    'akljd9gsdfbkjhaabajkhbbyiaahkjbjhbuykjakjhabkjhbabjhkaabbabbaaakljdfsjklababkjbsdabab',
  ],
  ['a*na*ha', 'anananahahanahanaha'],
  ['***a', 'a'],
  ['**a**', 'a'],
  ['a**b', 'ab'],
  ['*?', 'a'],
  ['*??', 'aa'],
  ['*?', 'a'],
  ['*?*a*', 'ba'],
  ['?at', 'bat'],
  ['?at', 'cat'],
  ['?o?se', 'horse'],
  ['?o?se', 'mouse'],
  ['*s', 'horses'],
  ['J*', 'Jeep'],
  ['J*', 'jeep'],
  ['*/foo', '/bar/foo'],
  ['ja*script', 'javascript'],
  ['*', undefined],
  ['*', ''],
  ['*', 'HelloWorld'],
  ['HelloWorld', 'HelloWorld'],
  ['Hello*', 'HelloWorld'],
  ['*World', 'HelloWorld'],
  ['?ello*', 'HelloWorld'],
  ['Hell?W*d', 'HelloWorld'],
  ['*.World', 'Hello.World'],
  ['*.World', 'Bye.World'],
];

const negativeTests: any = [
  ['', 'whatever'],
  ['/', 'target'],
  ['/', '/target'],
  ['foo', 'bar'],
  ['f?o', 'boo'],
  ['f??', 'boo'],
  ['fo*', 'boo'],
  ['f?*', 'boo'],
  ['abcd', 'abc'],
  ['??', 'a'],
  ['??', 'a'],
  ['*?*a', 'a'],
  ['a*na*ha', 'anananahahanahana'],
  ['*s', 'horse'],
];

describe('SamplingUtils', () => {
  describe('testWildcardMatch', () => {
    it('withOnlyWildcard', () => {
      expect(Utils.wildcardMatch('*', undefined)).toEqual(true);
    });
    it('withUndefinedPattern', () => {
      expect(Utils.wildcardMatch(undefined, '')).toEqual(false);
    });
    it('withEmptyPatternAndText', () => {
      expect(Utils.wildcardMatch('', '')).toEqual(true);
    });
    it('withRegexSuccess', () => {
      positiveTests.forEach((test: any) => {
        expect(Utils.wildcardMatch(test[0], test[1])).toEqual(true);
      });
    });
    it('withRegexFailure', () => {
      negativeTests.forEach((test: any) => {
        expect(Utils.wildcardMatch(test[0], test[1])).toEqual(false);
      });
    });
  });

  describe('testAttributeMatch', () => {
    it('testUndefinedAttributes', () => {
      const ruleAttributes = { string: 'string', string2: 'string2' };
      expect(Utils.attributeMatch(undefined, ruleAttributes)).toEqual(false);
      expect(Utils.attributeMatch({}, ruleAttributes)).toEqual(false);
      expect(
        Utils.attributeMatch({ string: 'string' }, ruleAttributes)
      ).toEqual(false);
    });
    it('testUndefinedRuleAttributes', () => {
      const attr = {
        number: 1,
        string: 'string',
        undefined: undefined,
        boolean: true,
      };

      expect(Utils.attributeMatch(attr, undefined)).toEqual(true);
    });
    it('testSuccessfulMatch', () => {
      const attr = { language: 'english' };
      const ruleAttribute = { language: 'en*sh' };

      expect(Utils.attributeMatch(attr, ruleAttribute)).toEqual(true);
    });
    it('testFailedMatch', () => {
      const attr = { language: 'french' };
      const ruleAttribute = { language: 'en*sh' };

      expect(Utils.attributeMatch(attr, ruleAttribute)).toEqual(false);
    });
    it('testExtraAttributesSuccess', () => {
      const attr = {
        number: 1,
        string: 'string',
        undefined: undefined,
        boolean: true,
      };
      const ruleAttribute = { string: 'string' };

      expect(Utils.attributeMatch(attr, ruleAttribute)).toEqual(true);
    });
    it('testExtraAttributesSuccess', () => {
      const attr = {
        number: 1,
        string: 'string',
        undefined: undefined,
        boolean: true,
      };
      const ruleAttribute = { string: 'string', number: '1' };

      expect(Utils.attributeMatch(attr, ruleAttribute)).toEqual(false);
    });
  });
});
