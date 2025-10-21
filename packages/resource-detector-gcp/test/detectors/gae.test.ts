/*
 * Copyright The OpenTelemetry Authors
 * Copyright 2023 Google LLC
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
import * as metadata from 'gcp-metadata';

import * as gae from '../../src/detectors/gae';
import * as assert from 'assert';

describe('App Engine (GAE)', () => {
  let metadataStub: sinon.SinonStubbedInstance<typeof metadata>;
  let envStub: NodeJS.ProcessEnv;
  beforeEach(() => {
    metadataStub = sinon.stub(metadata);
    envStub = sinon.replace(process, 'env', {});
  });

  afterEach(() => {
    sinon.restore();
  });

  it('detects when running on GAE', async () => {
    envStub.GAE_SERVICE = 'fake-service';
    const onGae = await gae.onAppEngine();
    assert(onGae);
  });
  it('detects when not running on GAE', async () => {
    const onGae = await gae.onAppEngine();
    assert(!onGae);
  });
  it('detects when running on GAE standard', async () => {
    envStub.GAE_ENV = 'standard';
    const onGaeStandard = await gae.onAppEngineStandard();
    assert(onGaeStandard);
  });

  it('detects GAE service name', async () => {
    envStub.GAE_SERVICE = 'fake-service';
    const serviceName = await gae.serviceName();
    assert.strictEqual(serviceName, 'fake-service');
  });

  it('detects GAE service version', async () => {
    envStub.GAE_VERSION = 'fake-version';
    const version = await gae.serviceVersion();
    assert.strictEqual(version, 'fake-version');
  });

  it('detects GAE service instance', async () => {
    envStub.GAE_INSTANCE = 'fake-instance';
    const instance = await gae.serviceInstance();
    assert.strictEqual(instance, 'fake-instance');
  });

  describe('GAE flex zone and region', () => {
    it('detects when correctly formatted', async () => {
      metadataStub.instance
        .withArgs('zone')
        .resolves('projects/233510669999/zones/us-east4-b');

      const zoneAndRegion = await gae.flexAvailabilityZoneAndRegion();
      assert.deepStrictEqual(zoneAndRegion, {
        zone: 'us-east4-b',
        region: 'us-east4',
      });
    });

    it('throws when incorrectly formatted', async () => {
      metadataStub.instance.withArgs('zone').resolves('');

      await assert.rejects(
        gae.flexAvailabilityZoneAndRegion(),
        /zone was not in the expected format/
      );
    });
  });

  describe('GAE standard zone and region', () => {
    it('detects zone', async () => {
      metadataStub.instance
        .withArgs('zone')
        .resolves('projects/233510669999/zones/us15');

      const zone = await gae.standardAvailabilityZone();
      assert.strictEqual(zone, 'us15');
    });

    it('detects region', async () => {
      metadataStub.instance
        .withArgs('region')
        .resolves('projects/233510669999/regions/us-east4');

      const region = await gae.standardCloudRegion();
      assert.deepStrictEqual(region, 'us-east4');
    });
  });
});
