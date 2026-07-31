/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nock from 'nock';
import * as assert from 'assert';
import { processDetector, envDetector } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { instanaAgentDetector } from '../src';

describe('[Integration] instanaAgentDetector', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.enableNetConnect();
    nock.cleanAll();
  });

  it('#1 should return merged resource', async () => {
    const mockedReply = {
      pid: 123,
      agentUuid: '14:7d:da:ff:fe:e4:08:d5',
    };

    const scope = nock('http://localhost:42699')
      .persist()
      .put('/com.instana.plugin.nodejs.discovery')
      .reply(200, () => mockedReply);

    const serviceName = 'TestService';
    const sdk = new NodeSDK({
      serviceName,
      resourceDetectors: [envDetector, processDetector, instanaAgentDetector],
    });

    sdk.start();

    const resource = sdk['_resource'];
    // await sdk.detectResources(); [< @opentelemetry/sdk-node@0.37.0]
    // await resource.waitForAsyncAttributes?.(); [>= @opentelemetry/sdk-node@0.37.0]
    await resource.waitForAsyncAttributes?.();

    assert.equal(resource.attributes['process.pid'], 123);
    assert.equal(resource.attributes['process.runtime.name'], 'nodejs');
    assert.equal(resource.attributes['service.name'], 'TestService');
    assert.equal(
      resource.attributes['service.instance.id'],
      '14:7d:da:ff:fe:e4:08:d5'
    );

    scope.done();
  });

  it('#2 should return merged resource', async () => {
    const mockedReply = {
      pid: 123,
      agentUuid: '14:7d:da:ff:fe:e4:08:d5',
    };

    const scope = nock('http://localhost:42699')
      .persist()
      .put('/com.instana.plugin.nodejs.discovery')
      .reply(200, () => mockedReply);

    const serviceName = 'TestService';
    const sdk = new NodeSDK({
      serviceName,
      resourceDetectors: [envDetector, processDetector, instanaAgentDetector],
    });

    sdk.start();
    const resource = sdk['_resource'];
    await resource.waitForAsyncAttributes?.();

    assert.equal(resource.attributes['process.pid'], 123);
    assert.equal(resource.attributes['process.runtime.name'], 'nodejs');
    assert.equal(resource.attributes['service.name'], 'TestService');
    assert.equal(
      resource.attributes['service.instance.id'],
      '14:7d:da:ff:fe:e4:08:d5'
    );

    scope.done();
  });
});
