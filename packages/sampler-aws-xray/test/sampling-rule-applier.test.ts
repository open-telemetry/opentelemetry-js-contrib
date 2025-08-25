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
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import {
  resourceFromAttributes,
  emptyResource,
} from '@opentelemetry/resources';
import {
  ATTR_AWS_LAMBDA_INVOKED_ARN,
  ATTR_HTTP_HOST,
  ATTR_HTTP_METHOD,
  ATTR_HTTP_TARGET,
  ATTR_HTTP_URL,
  ATTR_CLOUD_PLATFORM,
} from './../src/semconv';

import { expect } from 'expect';
import { SamplingRule } from '../src/sampling-rule';
import { SamplingRuleApplier } from '../src/sampling-rule-applier';

const DATA_DIR = __dirname + '/data';

describe('SamplingRuleApplier', () => {
  it('testApplierAttributeMatchingFromXRayResponse', () => {
    const sampleData = require(DATA_DIR +
      '/get-sampling-rules-response-sample-2.json');

    const allRules = sampleData['SamplingRuleRecords'];
    const defaultRule: SamplingRule = allRules[0]['SamplingRule'];
    const samplingRuleApplier = new SamplingRuleApplier(defaultRule);

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'test_service_name',
      [ATTR_CLOUD_PLATFORM]: 'test_cloud_platform',
    });

    const attr: Attributes = {
      [ATTR_HTTP_TARGET]: '/target',
      [ATTR_HTTP_METHOD]: 'method',
      [ATTR_HTTP_URL]: 'url',
      [ATTR_HTTP_HOST]: 'host',
      ['foo']: 'bar',
      ['abc']: '1234',
    };

    expect(samplingRuleApplier.matches(attr, resource)).toEqual(true);
  });

  it('testApplierMatchesWithAllAttributes', () => {
    const rule = new SamplingRule({
      Attributes: { abc: '123', def: '4?6', ghi: '*89' },
      FixedRate: 0.11,
      HTTPMethod: 'GET',
      Host: 'localhost',
      Priority: 20,
      ReservoirSize: 1,
      // Note that ResourceARN is usually only able to be "*"
      // See: https://docs.aws.amazon.com/xray/latest/devguide/xray-console-sampling.html#xray-console-sampling-options  # noqa: E501
      ResourceARN: 'arn:aws:lambda:us-west-2:123456789012:function:my-function',
      RuleARN: 'arn:aws:xray:us-east-1:999999999999:sampling-rule/test',
      RuleName: 'test',
      ServiceName: 'myServiceName',
      ServiceType: 'AWS::Lambda::Function',
      URLPath: '/helloworld',
      Version: 1,
    });

    const attributes: Attributes = {
      [ATTR_HTTP_HOST]: 'localhost',
      [ATTR_HTTP_METHOD]: 'GET',
      [ATTR_AWS_LAMBDA_INVOKED_ARN]:
        'arn:aws:lambda:us-west-2:123456789012:function:my-function',
      [ATTR_HTTP_URL]: 'http://127.0.0.1:5000/helloworld',
      ['abc']: '123',
      ['def']: '456',
      ['ghi']: '789',
    };

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'myServiceName',
      [ATTR_CLOUD_PLATFORM]: 'aws_lambda',
    });

    const ruleApplier = new SamplingRuleApplier(rule);

    expect(ruleApplier.matches(attributes, resource)).toEqual(true);
    delete attributes[ATTR_HTTP_URL];
    attributes[ATTR_HTTP_TARGET] = '/helloworld';
    expect(ruleApplier.matches(attributes, resource)).toEqual(true);
  });
  it('testApplierWildCardAttributesMatchesSpanAttributes', () => {
    const rule = new SamplingRule({
      Attributes: {
        attr1: '*',
        attr2: '*',
        attr3: 'HelloWorld',
        attr4: 'Hello*',
        attr5: '*World',
        attr6: '?ello*',
        attr7: 'Hell?W*d',
        attr8: '*.World',
        attr9: '*.World',
      },
      FixedRate: 0.11,
      HTTPMethod: '*',
      Host: '*',
      Priority: 20,
      ReservoirSize: 1,
      ResourceARN: '*',
      RuleARN: 'arn:aws:xray:us-east-1:999999999999:sampling-rule/test',
      RuleName: 'test',
      ServiceName: '*',
      ServiceType: '*',
      URLPath: '*',
      Version: 1,
    });
    const ruleApplier = new SamplingRuleApplier(rule);

    const attributes: Attributes = {
      attr1: '',
      attr2: 'HelloWorld',
      attr3: 'HelloWorld',
      attr4: 'HelloWorld',
      attr5: 'HelloWorld',
      attr6: 'HelloWorld',
      attr7: 'HelloWorld',
      attr8: 'Hello.World',
      attr9: 'Bye.World',
    };

    expect(ruleApplier.matches(attributes, emptyResource())).toEqual(true);
  });

  it('testApplierWildCardAttributesMatchesHttpSpanAttributes', () => {
    const ruleApplier = new SamplingRuleApplier(
      new SamplingRule({
        Attributes: {},
        FixedRate: 0.11,
        HTTPMethod: '*',
        Host: '*',
        Priority: 20,
        ReservoirSize: 1,
        ResourceARN: '*',
        RuleARN: 'arn:aws:xray:us-east-1:999999999999:sampling-rule/test',
        RuleName: 'test',
        ServiceName: '*',
        ServiceType: '*',
        URLPath: '*',
        Version: 1,
      })
    );

    const attributes: Attributes = {
      [ATTR_HTTP_HOST]: 'localhost',
      [ATTR_HTTP_METHOD]: 'GET',
      [ATTR_HTTP_URL]: 'http://127.0.0.1:5000/helloworld',
    };

    expect(ruleApplier.matches(attributes, emptyResource())).toEqual(true);
  });

  it('testApplierWildCardAttributesMatchesWithEmptyAttributes', () => {
    const ruleApplier = new SamplingRuleApplier(
      new SamplingRule({
        Attributes: {},
        FixedRate: 0.11,
        HTTPMethod: '*',
        Host: '*',
        Priority: 20,
        ReservoirSize: 1,
        ResourceARN: '*',
        RuleARN: 'arn:aws:xray:us-east-1:999999999999:sampling-rule/test',
        RuleName: 'test',
        ServiceName: '*',
        ServiceType: '*',
        URLPath: '*',
        Version: 1,
      })
    );

    const attributes: Attributes = {};
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'myServiceName',
      [ATTR_CLOUD_PLATFORM]: 'aws_ec2',
    });

    expect(ruleApplier.matches(attributes, resource)).toEqual(true);
    expect(ruleApplier.matches({}, resource)).toEqual(true);
    expect(ruleApplier.matches(attributes, emptyResource())).toEqual(true);
    expect(ruleApplier.matches({}, emptyResource())).toEqual(true);
    expect(ruleApplier.matches(attributes, emptyResource())).toEqual(true);
    expect(ruleApplier.matches({}, emptyResource())).toEqual(true);
  });

  it('testApplierMatchesWithHttpUrlWithHttpTargetUndefined', () => {
    const ruleApplier = new SamplingRuleApplier(
      new SamplingRule({
        Attributes: {},
        FixedRate: 0.11,
        HTTPMethod: '*',
        Host: '*',
        Priority: 20,
        ReservoirSize: 1,
        ResourceARN: '*',
        RuleARN: 'arn:aws:xray:us-east-1:999999999999:sampling-rule/test',
        RuleName: 'test',
        ServiceName: '*',
        ServiceType: '*',
        URLPath: '/somerandompath',
        Version: 1,
      })
    );

    const attributes: Attributes = {
      [ATTR_HTTP_URL]: 'https://somerandomurl.com/somerandompath',
    };
    const resource = emptyResource();

    expect(ruleApplier.matches(attributes, resource)).toEqual(true);
    expect(ruleApplier.matches(attributes, emptyResource())).toEqual(true);
    expect(ruleApplier.matches(attributes, emptyResource())).toEqual(true);
  });
});
