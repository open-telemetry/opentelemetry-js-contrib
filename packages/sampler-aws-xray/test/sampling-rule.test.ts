/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Includes work from:
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { expect } from 'expect';
import { SamplingRule } from '../src/sampling-rule';

describe('SamplingRule', () => {
  it('testSamplingRuleEquality', () => {
    const rule = new SamplingRule({
      Attributes: { abc: '123', def: '4?6', ghi: '*89' },
      FixedRate: 0.11,
      HTTPMethod: 'GET',
      Host: 'localhost',
      Priority: 20,
      ReservoirSize: 1,
      ResourceARN: '*',
      RuleARN: 'arn:aws:xray:us-east-1:999999999999:sampling-rule/test',
      RuleName: 'test',
      ServiceName: 'myServiceName',
      ServiceType: 'AWS::EKS::Container',
      URLPath: '/helloworld',
      Version: 1,
    });
    const rule_unordered_attributes = new SamplingRule({
      Attributes: { ghi: '*89', abc: '123', def: '4?6' },
      FixedRate: 0.11,
      HTTPMethod: 'GET',
      Host: 'localhost',
      Priority: 20,
      ReservoirSize: 1,
      ResourceARN: '*',
      RuleARN: 'arn:aws:xray:us-east-1:999999999999:sampling-rule/test',
      RuleName: 'test',
      ServiceName: 'myServiceName',
      ServiceType: 'AWS::EKS::Container',
      URLPath: '/helloworld',
      Version: 1,
    });

    expect(rule.equals(rule_unordered_attributes));

    const rule_updated = new SamplingRule({
      Attributes: { ghi: '*89', abc: '123', def: '4?6' },
      FixedRate: 0.11,
      HTTPMethod: 'GET',
      Host: 'localhost',
      Priority: 20,
      ReservoirSize: 1,
      ResourceARN: '*',
      RuleARN: 'arn:aws:xray:us-east-1:999999999999:sampling-rule/test',
      RuleName: 'test',
      ServiceName: 'myServiceName',
      ServiceType: 'AWS::EKS::Container',
      URLPath: '/helloworld_new',
      Version: 1,
    });
    const rule_updated_2 = new SamplingRule({
      Attributes: { abc: '128', def: '4?6', ghi: '*89' },
      FixedRate: 0.11,
      HTTPMethod: 'GET',
      Host: 'localhost',
      Priority: 20,
      ReservoirSize: 1,
      ResourceARN: '*',
      RuleARN: 'arn:aws:xray:us-east-1:999999999999:sampling-rule/test',
      RuleName: 'test',
      ServiceName: 'myServiceName',
      ServiceType: 'AWS::EKS::Container',
      URLPath: '/helloworld',
      Version: 1,
    });

    expect(rule.equals(rule_updated)).toEqual(false);
    expect(rule.equals(rule_updated_2)).toEqual(false);
  });
});
