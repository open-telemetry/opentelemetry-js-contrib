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

import * as sinon from 'sinon';
import axios from 'axios';
import * as nock from 'nock';
import * as assert from 'assert';

import { AWSXRayRemoteSampler } from '../src';

describe('GetSamplingRules', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getSamplingRulesResponseStub: any = {
    NextToken: null,
    SamplingRuleRecords: [
      {
        CreatedAt: 1.67799933e9,
        ModifiedAt: 1.67799933e9,
        SamplingRule: {
          Attributes: {
            foo: 'bar',
            doo: 'baz',
          },
          FixedRate: 0.05,
          HTTPMethod: '*',
          Host: '*',
          Priority: 1000,
          ReservoirSize: 10,
          ResourceARN: '*',
          RuleARN: 'arn:aws:xray:us-west-2:123456789000:sampling-rule/Rule1',
          RuleName: 'Rule1',
          ServiceName: '*',
          ServiceType: 'AWS::Foo::Bar',
          URLPath: '*',
          Version: 1,
        },
      },
      {
        CreatedAt: 0.0,
        ModifiedAt: 1.611564245e9,
        SamplingRule: {
          Attributes: {},
          FixedRate: 0.05,
          HTTPMethod: '*',
          Host: '*',
          Priority: 10000,
          ReservoirSize: 1,
          ResourceARN: '*',
          RuleARN: 'arn:aws:xray:us-west-2:123456789000:sampling-rule/Default',
          RuleName: 'Default',
          ServiceName: '*',
          ServiceType: '*',
          URLPath: '*',
          Version: 1,
        },
      },
      {
        CreatedAt: 1.676038494e9,
        ModifiedAt: 1.676038494e9,
        SamplingRule: {
          Attributes: {},
          FixedRate: 0.2,
          HTTPMethod: 'GET',
          Host: '*',
          Priority: 1,
          ReservoirSize: 10,
          ResourceARN: '*',
          RuleARN: 'arn:aws:xray:us-west-2:123456789000:sampling-rule/Rule2',
          RuleName: 'Rule2',
          ServiceName: 'FooBar',
          ServiceType: '*',
          URLPath: '/foo/bar',
          Version: 1,
        },
      },
    ],
  };

  let clock: sinon.SinonFakeTimers;
  let sampler: AWSXRayRemoteSampler;
  let axiosPostSpy: sinon.SinonSpy;

  const defaultEndpoint = 'http://localhost:2000';
  const pollingInterval = 60 * 1000;
  const config = {
    endpoint: defaultEndpoint,
    pollingInterval: pollingInterval,
  };

  before(() => {
    nock('http://localhost:2000')
      .persist()
      .post('/GetSamplingRules')
      .reply(200, getSamplingRulesResponseStub);
  });

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    axiosPostSpy = sinon.spy(axios, 'post');
    sampler = new AWSXRayRemoteSampler(config);
  });

  afterEach(() => {
    clock.restore();
    axiosPostSpy.restore();
  });

  it('should throw TypeError when an invalid polling interval is passed in', async () => {
    const configWithZeroPollingInterval = {
      endpoint: 'http://localhost:2000',
      pollingInterval: 0,
    };
    const configWithNegativeInterval = {
      endpoint: 'http://localhost:2000',
      pollingInterval: -5,
    };

    assert.throws(
      () => new AWSXRayRemoteSampler(configWithZeroPollingInterval),
      TypeError
    );
    assert.throws(
      () => new AWSXRayRemoteSampler(configWithNegativeInterval),
      TypeError
    );
  });

  it('should make a POST request to the /GetSamplingRules endpoint', async () => {
    clock.tick(pollingInterval);
    sinon.assert.calledOnce(axiosPostSpy);
  });

  it('should make 3 POST requests to the /GetSamplingRules endpoint after 3 intervals have passed', async () => {
    clock.tick(pollingInterval);
    clock.tick(pollingInterval);
    clock.tick(pollingInterval);

    sinon.assert.calledThrice(axiosPostSpy);
  });

  it('should initialize endpoint and polling interval from config correctly', async () => {
    assert.strictEqual(
      sampler.toString(),
      `AWSXRayRemoteSampler{endpoint=${
        defaultEndpoint + '/GetSamplingRules'
      }, pollingInterval=${pollingInterval}}`
    );
  });

  it('should fall back to default polling interval and endpoint if not specified in config', async () => {
    const sampler = new AWSXRayRemoteSampler({});

    // default polling interval (5 minutes) = 5 * 60 * 100
    assert.strictEqual(
      sampler.toString(),
      `AWSXRayRemoteSampler{endpoint=${
        defaultEndpoint + '/GetSamplingRules'
      }, pollingInterval=${5 * 60 * 1000}}`
    );
  });
});
