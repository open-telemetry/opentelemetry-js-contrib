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

import { setTimeout as setTimeoutP } from 'timers/promises';
import * as nock from 'nock';
import * as assert from 'assert';
import { detectResources } from '@opentelemetry/resources';
import { CLOUDPROVIDERVALUES_ALIBABA_CLOUD } from '@opentelemetry/semantic-conventions';
import {
  assertCloudResource,
  assertHostResource,
} from '@opentelemetry/contrib-test-utils';
import { alibabaCloudEcsDetector } from '../../src';

const ALIYUN_HOST =
  'http://' + alibabaCloudEcsDetector.ALIBABA_CLOUD_IDMS_ENDPOINT;
const ALIYUN_IDENTITY_PATH =
  alibabaCloudEcsDetector.ALIBABA_CLOUD_INSTANCE_IDENTITY_DOCUMENT_PATH;
const ALIYUN_HOST_PATH =
  alibabaCloudEcsDetector.ALIBABA_CLOUD_INSTANCE_HOST_DOCUMENT_PATH;

const mockedIdentityResponse = {
  'image-id': 'my-image-id',
  'instance-id': 'my-instance-id',
  'instance-type': 'my-instance-type',
  mac: 'my-mac',
  'owner-account-id': 'my-owner-account-id',
  'private-ipv4': 'my-private-ipv4',
  'region-id': 'my-region-id',
  'serial-number': 'my-serial-number',
  'zone-id': 'my-zone-id',
};
const mockedHostResponse = 'my-hostname';

describe('alibabaCloudEcsDetector', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.enableNetConnect();
  });

  describe('with successful request', () => {
    it('should return alibaba cloud ecs instance resource', async () => {
      const scope = nock(ALIYUN_HOST)
        .persist()
        .get(ALIYUN_IDENTITY_PATH)
        .reply(200, () => mockedIdentityResponse)
        .get(ALIYUN_HOST_PATH)
        .reply(200, () => mockedHostResponse);

      const resource = detectResources({
        detectors: [alibabaCloudEcsDetector],
      });
      await resource.waitForAsyncAttributes?.();

      scope.done();

      assert.ok(resource);

      assertCloudResource(resource, {
        provider: CLOUDPROVIDERVALUES_ALIBABA_CLOUD,
        accountId: 'my-owner-account-id',
        region: 'my-region-id',
        zone: 'my-zone-id',
      });
      assertHostResource(resource, {
        id: 'my-instance-id',
        hostType: 'my-instance-type',
        name: 'my-hostname',
      });
    });
  });

  describe('with unsuccessful request', () => {
    it('should return empty resource when receiving error response code', async () => {
      const scope = nock(ALIYUN_HOST)
        .persist()
        .get(ALIYUN_IDENTITY_PATH)
        .reply(200, () => mockedIdentityResponse)
        .get(ALIYUN_HOST_PATH)
        .reply(404, () => new Error());

      const resource = detectResources({
        detectors: [alibabaCloudEcsDetector],
      });
      await resource.waitForAsyncAttributes?.();

      assert.deepStrictEqual(resource.attributes, {});

      scope.done();
    });

    it('should return empty resource when timed out', async () => {
      const scope = nock(ALIYUN_HOST)
        .get(ALIYUN_IDENTITY_PATH)
        .reply(200, () => mockedIdentityResponse)
        .get(ALIYUN_HOST_PATH)
        .delayConnection(2000)
        .reply(200, () => mockedHostResponse);

      const resource = detectResources({
        detectors: [alibabaCloudEcsDetector],
      });
      await resource.waitForAsyncAttributes?.();

      assert.deepStrictEqual(resource.attributes, {});

      scope.done();
    });

    it('should return empty resource when replied with an Error', async () => {
      const scope = nock(ALIYUN_HOST)
        .get(ALIYUN_IDENTITY_PATH)
        .replyWithError('NOT FOUND');

      const resource = detectResources({
        detectors: [alibabaCloudEcsDetector],
      });
      await resource.waitForAsyncAttributes?.();

      assert.deepStrictEqual(resource.attributes, {});

      scope.done();
    });
  });

  describe('with delay in calling .waitForAsyncAttributes()', () => {
    // Note any `unhandledRejection` process events during the test run.
    let gotUnhandledRejections: Error[];
    const unhandleRejectionHandler = (err: any) => {
      gotUnhandledRejections.push(err);
    };
    beforeEach(() => {
      gotUnhandledRejections = [];
      process.on('unhandledRejection', unhandleRejectionHandler);
    });
    afterEach(() => {
      process.removeListener('unhandledRejection', unhandleRejectionHandler);
    });

    it('should return empty resource when receiving error', async () => {
      const scope = nock(ALIYUN_HOST)
        .get(ALIYUN_IDENTITY_PATH)
        .replyWithError('NOT FOUND');

      const resource = detectResources({
        detectors: [alibabaCloudEcsDetector],
      });
      // This pause simulates the delay between `detectResources` and
      // `waitForAsyncAttributes` typically called later in an exporter.
      await setTimeoutP(200); // Hope this is enough time to get error response.
      await resource.waitForAsyncAttributes?.();

      assert.deepStrictEqual(resource.attributes, {});
      assert.deepStrictEqual(gotUnhandledRejections, []);

      scope.done();
    });
  });
});
