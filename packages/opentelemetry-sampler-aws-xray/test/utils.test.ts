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

import { attributeMatch, wildcardMatch } from '../src/utils';
import { Attributes } from '@opentelemetry/api';

describe('WildcardMatch', () => {
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
    ['a*na*ha', 'anananahahanahana'],
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
    ['*s', 'horse'],
    ['J*', 'Jeep'],
    ['J*', 'jeep'],
    ['*/foo', '/bar/foo'],
  ];

  const negativeTests: any = [
    ['', 'whatever'],
    ['foo', 'bar'],
    ['f?o', 'boo'],
    ['f??', 'boo'],
    ['fo*', 'boo'],
    ['f?*', 'boo'],
    ['abcd', 'abc'],
    ['??', 'a'],
    ['??', 'a'],
    ['*?*a', 'a'],
  ];

  it('should return true for wildcard match', () => {
    positiveTests.forEach((test: any) => {
      assert.equal(wildcardMatch(test[0], test[1]), true);
    });
  });

  it('should return false for wildcard match', () => {
    negativeTests.forEach((test: any) => {
      assert.equal(wildcardMatch(test[0], test[1]), false);
    });
  });

  it('additional wildcardMatch tests', () => {
    assert.equal(wildcardMatch('*', undefined), true);
    assert.equal(wildcardMatch('*', ''), true);
    assert.equal(wildcardMatch('*', 'HelloWorld'), true);

    assert.equal(wildcardMatch('Hello*', undefined), false);
    assert.equal(wildcardMatch(undefined, 'HelloWorld'), false);

    assert.equal(wildcardMatch('HelloWorld', 'HelloWorld'), true);
    assert.equal(wildcardMatch('Hello*', 'HelloWorld'), true);
    assert.equal(wildcardMatch('*World', 'HelloWorld'), true);
    assert.equal(wildcardMatch('?ello*', 'HelloWorld'), true);
  });
});

describe('attributeMatcher', () => {
  const attributes: Attributes = { dog: 'bark', cat: 'meow', cow: 'mooo' };

  const ruleAttributes = { dog: 'bar?', cow: 'mooo' };

  it('should return true for attribute match', () => {
    assert.equal(attributeMatch(attributes, ruleAttributes), true);
  });

  it('should return true when rule attributes is an empty object', () => {
    assert.equal(attributeMatch(attributes, {}), true);
  });

  it('should return false when span attributes is undefined or an empty object', () => {
    assert.equal(attributeMatch({}, ruleAttributes), false);
    // TODO: enforce attributes type and remove this test
    assert.equal(attributeMatch(undefined, ruleAttributes), false);
  });
});
