/*
 * Copyright 2022 Google LLC
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
import * as metadata from 'gcp-metadata';

import * as gke from '../../src/detectors/gke';
import * as assert from 'assert';

describe('GKE', () => {
  let metadataStub: sinon.SinonStubbedInstance<typeof metadata>;
  let envStub: NodeJS.ProcessEnv;
  beforeEach(() => {
    metadataStub = sinon.stub(metadata);
    envStub = sinon.replace(process, 'env', {});
  });

  afterEach(() => {
    sinon.restore();
  });

  it('detects when running on GKE', async () => {
    envStub.KUBERNETES_SERVICE_HOST = 'fake-service-host';
    const onGke = await gke.onGke();
    assert(onGke);
  });

  it('detects when not running on GKE', async () => {
    const onGke = await gke.onGke();
    assert(!onGke);
  });

  it('detects host id', async () => {
    metadataStub.instance.withArgs('id').resolves(12345);

    const hostId = await gke.hostId();
    assert.strictEqual(hostId, '12345');
  });

  it('detects cluster name', async () => {
    metadataStub.instance
      .withArgs('attributes/cluster-name')
      .resolves('fake-cluster-name');

    const clusterName = await gke.clusterName();
    assert.strictEqual(clusterName, 'fake-cluster-name');
  });

  describe('zone or region', () => {
    it('detects region', async () => {
      metadataStub.instance
        .withArgs('attributes/cluster-location')
        .resolves('us-east4');

      const zoneOrRegion = await gke.availabilityZoneOrRegion();
      assert.deepStrictEqual(zoneOrRegion, {
        type: 'region',
        value: 'us-east4',
      });
    });

    it('detects zone', async () => {
      metadataStub.instance
        .withArgs('attributes/cluster-location')
        .resolves('us-east4-b');

      const zoneOrRegion = await gke.availabilityZoneOrRegion();
      assert.deepStrictEqual(zoneOrRegion, {
        type: 'zone',
        value: 'us-east4-b',
      });
    });

    it('throws when incorrectly formatted', async () => {
      metadataStub.instance
        .withArgs('attributes/cluster-location')
        .resolves('');

      await assert.rejects(
        gke.availabilityZoneOrRegion(),
        /unrecognized format for cluster location/
      );
    });
  });
});
