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

import * as gce from '../../src/detectors/gce';
import * as assert from 'assert';
import { BigNumber } from 'bignumber.js';

describe('GCE', () => {
  let metadataStub: sinon.SinonStubbedInstance<typeof metadata>;
  beforeEach(() => {
    metadataStub = sinon.stub(metadata);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('detects when running on GCE', async () => {
    metadataStub.instance
      .withArgs('machine-type')
      .resolves('fake-machine-type');

    const onGce = await gce.onGce();
    assert(onGce);
  });

  it('detects when not running on GCE', async () => {
    metadataStub.instance
      .withArgs('machine-type')
      .rejects('attribute not found!');

    const onGce = await gce.onGce();
    assert(!onGce);
  });

  it('detects host type', async () => {
    metadataStub.instance
      .withArgs('machine-type')
      .resolves('fake-machine-type');

    const hostType = await gce.hostType();
    assert.strictEqual(hostType, 'fake-machine-type');
  });

  describe('detects host id', () => {
    it('as a number', async () => {
      metadataStub.instance.withArgs('id').resolves(12345);

      const hostId = await gce.hostId();
      assert.strictEqual(hostId, '12345');
    });

    it('as a BigNumber', async () => {
      metadataStub.instance
        .withArgs('id')
        .resolves(new BigNumber('2459451723172637654'));

      const hostId = await gce.hostId();
      assert.strictEqual(hostId, '2459451723172637654');
    });
  });

  it('detects host name', async () => {
    metadataStub.instance.withArgs('name').resolves('fake-name');

    const hostName = await gce.hostName();
    assert.strictEqual(hostName, 'fake-name');
  });

  describe('zone and region', () => {
    it('detects when correctly formatted', async () => {
      metadataStub.instance
        .withArgs('zone')
        .resolves('projects/233510669999/zones/us-east4-b');

      const zoneAndRegion = await gce.availabilityZoneAndRegion();
      assert.deepStrictEqual(zoneAndRegion, {
        zone: 'us-east4-b',
        region: 'us-east4',
      });
    });

    it('throws when incorrectly formatted', async () => {
      metadataStub.instance.withArgs('zone').resolves('');

      await assert.rejects(
        gce.availabilityZoneAndRegion(),
        /zone was not in the expected format/
      );
    });
  });
});
