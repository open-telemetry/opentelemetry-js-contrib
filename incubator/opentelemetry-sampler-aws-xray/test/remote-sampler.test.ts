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

import {
  resourceFromAttributes,
  emptyResource,
} from '@opentelemetry/resources';
import { context, Span, SpanKind, Tracer, trace } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  SEMRESATTRS_CLOUD_PLATFORM,
  ATTR_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';
import { expect } from 'expect';
import * as nock from 'nock';
import * as sinon from 'sinon';
import {
  _AWSXRayRemoteSampler,
  AWSXRayRemoteSampler,
} from '../src/remote-sampler';
import { AWSXRaySamplingClient } from '../src/aws-xray-sampling-client';

const DATA_DIR_SAMPLING_RULES =
  __dirname + '/data/test-remote-sampler_sampling-rules-response-sample.json';
const TEST_URL = 'http://localhost:2000';

describe('AWSXRayRemoteSampler', () => {
  let sampler: AWSXRayRemoteSampler;

  afterEach(() => {
    if (sampler != null) {
      sampler.stopPollers();
    }
  });

  it('testCreateRemoteSamplerWithEmptyResource', () => {
    const sampler: AWSXRayRemoteSampler = new AWSXRayRemoteSampler({
      resource: emptyResource(),
    });

    expect(sampler['internalXraySampler']['rulePoller']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['rulePollingIntervalMillis']).toEqual(
      300 * 1000
    );
    expect(sampler['internalXraySampler']['samplingClient']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['ruleCache']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['clientId']).toMatch(/[a-f0-9]{24}/);
  });

  it('testCreateRemoteSamplerWithPopulatedResource', () => {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'test-service-name',
      [SEMRESATTRS_CLOUD_PLATFORM]: 'test-cloud-platform',
    });
    sampler = new AWSXRayRemoteSampler({ resource: resource });

    expect(sampler['internalXraySampler']['rulePoller']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['rulePollingIntervalMillis']).toEqual(
      300 * 1000
    );
    expect(sampler['internalXraySampler']['samplingClient']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['ruleCache']).not.toBeFalsy();
    expect(
      sampler['internalXraySampler']['ruleCache']['samplerResource'].attributes
    ).toEqual(resource.attributes);
    expect(sampler['internalXraySampler']['clientId']).toMatch(/[a-f0-9]{24}/);
  });

  it('testCreateRemoteSamplerWithAllFieldsPopulated', () => {
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'test-service-name',
      [SEMRESATTRS_CLOUD_PLATFORM]: 'test-cloud-platform',
    });
    sampler = new AWSXRayRemoteSampler({
      resource: resource,
      endpoint: 'http://abc.com',
      pollingInterval: 120, // seconds
    });

    expect(sampler['internalXraySampler']['rulePoller']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['rulePollingIntervalMillis']).toEqual(
      120 * 1000
    );
    expect(sampler['internalXraySampler']['samplingClient']).not.toBeFalsy();
    expect(sampler['internalXraySampler']['ruleCache']).not.toBeFalsy();
    expect(
      sampler['internalXraySampler']['ruleCache']['samplerResource'].attributes
    ).toEqual(resource.attributes);
    expect(sampler['internalXraySampler']['awsProxyEndpoint']).toEqual(
      'http://abc.com'
    );
    expect(sampler['internalXraySampler']['clientId']).toMatch(/[a-f0-9]{24}/);
  });

  it('testUpdateSamplingRulesAndTargetsWithPollersAndShouldSample', done => {
    nock(TEST_URL)
      .post('/GetSamplingRules')
      .reply(200, require(DATA_DIR_SAMPLING_RULES));

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'test-service-name',
      [SEMRESATTRS_CLOUD_PLATFORM]: 'test-cloud-platform',
    });

    sampler = new AWSXRayRemoteSampler({
      resource: resource,
    });

    setTimeout(() => {
      expect(
        sampler['internalXraySampler']['ruleCache']['ruleAppliers'][0]
          .samplingRule.RuleName
      ).toEqual('test');
      expect(
        sampler.shouldSample(
          context.active(),
          '1234',
          'name',
          SpanKind.CLIENT,
          { abc: '1234' },
          []
        ).decision
      ).toEqual(SamplingDecision.NOT_RECORD);

      // TODO: Run more tests after updating Sampling Targets
      done();
    }, 50);
  });

  it('generates valid ClientId', () => {
    const clientId: string = _AWSXRayRemoteSampler['generateClientId']();
    const match: RegExpMatchArray | null = clientId.match(/[0-9a-z]{24}/g);
    expect(match).not.toBeNull();
  });

  it('toString()', () => {
    expect(
      new AWSXRayRemoteSampler({ resource: emptyResource() }).toString()
    ).toEqual(
      'AWSXRayRemoteSampler{root=ParentBased{root=_AWSXRayRemoteSampler{awsProxyEndpoint=http://localhost:2000, rulePollingIntervalMillis=300000}, remoteParentSampled=AlwaysOnSampler, remoteParentNotSampled=AlwaysOffSampler, localParentSampled=AlwaysOnSampler, localParentNotSampled=AlwaysOffSampler}'
    );
  });

  // TODO: Run tests for Reservoir Sampling and Sampling Statistics
});

describe('_AWSXRayRemoteSampler', () => {
  const pollingInterval = 60;
  let clock: sinon.SinonFakeTimers;
  let fetchSamplingRulesSpy: sinon.SinonSpy;
  let sampler: _AWSXRayRemoteSampler | undefined;

  beforeEach(() => {
    fetchSamplingRulesSpy = sinon.spy(
      AWSXRaySamplingClient.prototype,
      'fetchSamplingRules'
    );
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    if (sampler != null) {
      sampler.stopPollers();
    }
    fetchSamplingRulesSpy.restore();
    clock.restore();
  });

  it('should invoke fetchSamplingRules() after initialization', async () => {
    sampler = new _AWSXRayRemoteSampler({
      resource: emptyResource(),
      pollingInterval: pollingInterval,
    });
    sinon.assert.calledOnce(fetchSamplingRulesSpy);
  });

  it('should invoke fetchSamplingRules() 3 times after initialization and 2 intervals have passed', async () => {
    sampler = new _AWSXRayRemoteSampler({
      resource: emptyResource(),
      pollingInterval: pollingInterval,
    });
    clock.tick(pollingInterval * 1000 + 5000);
    clock.tick(pollingInterval * 1000 + 5000);

    sinon.assert.calledThrice(fetchSamplingRulesSpy);
  });
});
