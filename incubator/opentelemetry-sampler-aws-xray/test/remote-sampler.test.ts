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

import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_CLOUD_PLATFORM,
  ATTR_SERVICE_NAME,
} from '@opentelemetry/semantic-conventions';
import { expect } from 'expect';
import {
  _AWSXRayRemoteSampler,
  AWSXRayRemoteSampler,
} from '../src/remote-sampler';
import * as sinon from 'sinon';
import * as http from 'http';

describe('AWSXRayRemoteSampler', () => {
  let sampler: AWSXRayRemoteSampler | undefined;

  afterEach(() => {
    if (sampler != null) {
      sampler.stopPollers();
    }
  });

  it('testCreateRemoteSamplerWithEmptyResource', () => {
    sampler = new AWSXRayRemoteSampler({
      resource: Resource.EMPTY,
    });

    expect((sampler as any)._root._root.rulePoller).not.toBeFalsy();
    expect((sampler as any)._root._root.rulePollingIntervalMillis).toEqual(
      300 * 1000
    );
    expect((sampler as any)._root._root.samplingClient).not.toBeFalsy();
    expect((sampler as any)._root._root.clientId).toMatch(/[a-f0-9]{24}/);
  });

  it('testCreateRemoteSamplerWithPopulatedResource', () => {
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: 'test-service-name',
      [SEMRESATTRS_CLOUD_PLATFORM]: 'test-cloud-platform',
    });
    sampler = new AWSXRayRemoteSampler({ resource: resource });

    expect((sampler as any)._root._root.rulePoller).not.toBeFalsy();
    expect((sampler as any)._root._root.rulePollingIntervalMillis).toEqual(
      300 * 1000
    );
    expect((sampler as any)._root._root.samplingClient).not.toBeFalsy();
    expect((sampler as any)._root._root.clientId).toMatch(/[a-f0-9]{24}/);
  });

  it('testCreateRemoteSamplerWithAllFieldsPopulated', () => {
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: 'test-service-name',
      [SEMRESATTRS_CLOUD_PLATFORM]: 'test-cloud-platform',
    });
    sampler = new AWSXRayRemoteSampler({
      resource: resource,
      endpoint: 'http://abc.com',
      pollingInterval: 120, // seconds
    });

    expect((sampler as any)._root._root.rulePoller).not.toBeFalsy();
    expect((sampler as any)._root._root.rulePollingIntervalMillis).toEqual(
      120 * 1000
    );
    expect((sampler as any)._root._root.samplingClient).not.toBeFalsy();
    expect((sampler as any)._root._root.awsProxyEndpoint).toEqual(
      'http://abc.com'
    );
    expect((sampler as any)._root._root.clientId).toMatch(/[a-f0-9]{24}/);
  });

  it('toString()', () => {
    expect(
      new AWSXRayRemoteSampler({ resource: Resource.EMPTY }).toString()
    ).toEqual(
      'AWSXRayRemoteSampler{root=ParentBased{root=_AWSXRayRemoteSampler{awsProxyEndpoint=http://localhost:2000, rulePollingIntervalMillis=300000}, remoteParentSampled=AlwaysOnSampler, remoteParentNotSampled=AlwaysOffSampler, localParentSampled=AlwaysOnSampler, localParentNotSampled=AlwaysOffSampler}'
    );
  });
});

describe('_AWSXRayRemoteSampler', () => {
  const pollingInterval = 60;
  let clock: sinon.SinonFakeTimers;
  let xrayClientSpy: sinon.SinonSpy;
  let sampler: _AWSXRayRemoteSampler | undefined;

  beforeEach(() => {
    xrayClientSpy = sinon.spy(http, 'request');
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    if (sampler != null) {
      sampler.stopPollers();
    }
    xrayClientSpy.restore();
    clock.restore();
  });

  it('should make a POST request to the /GetSamplingRules endpoint upon initialization', async () => {
    sampler = new _AWSXRayRemoteSampler({
      resource: Resource.EMPTY,
      pollingInterval: pollingInterval,
    });
    sinon.assert.calledOnce(xrayClientSpy);
  });

  it('should make 3 POST requests to the /GetSamplingRules endpoint after 3 intervals have passed', async () => {
    sampler = new _AWSXRayRemoteSampler({
      resource: Resource.EMPTY,
      pollingInterval: pollingInterval,
    });
    clock.tick(pollingInterval * 1000 + 5000);
    clock.tick(pollingInterval * 1000 + 5000);

    sinon.assert.calledThrice(xrayClientSpy);
  });

  it('generates valid ClientId', () => {
    const clientId: string = _AWSXRayRemoteSampler['generateClientId']();
    const match: RegExpMatchArray | null = clientId.match(/[0-9a-z]{24}/g);
    expect(match).not.toBeNull();
  });
});
