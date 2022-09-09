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

import * as nock from 'nock';
import * as assert from 'assert';
import {
  Resource,
  processDetector,
  envDetector,
} from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
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

  it('should return merged resource', async () => {
    const mockedReply = {
      pid: 123,
      agentUuid: '14:7d:da:ff:fe:e4:08:d5',
    };

    const scope = nock('http://localhost:42699')
      .persist()
      .put('/com.instana.plugin.nodejs.discovery')
      .reply(200, () => mockedReply);

    const serviceName = 'TestService';
    const globalResource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    });

    const sdk = new NodeSDK({
      autoDetectResources: false,
      resource: globalResource,
    });

    // attributes are automatically merged!
    await sdk.detectResources({
      detectors: [envDetector, processDetector, instanaAgentDetector],
    });

    const resource = sdk['_resource'];

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
