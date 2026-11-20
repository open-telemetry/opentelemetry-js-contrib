/*
 * Copyright The OpenTelemetry Authors
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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

  describe('instance hostname', () => {
    it('detects instance hostname', async () => {
      metadataStub.instance
        .withArgs('hostname')
        .resolves('fake-name.us-east4-b.c.fake-project-id.internal');

      const hostname = await gce.instanceHostname();
      assert.strictEqual(
        hostname,
        'fake-name.us-east4-b.c.fake-project-id.internal'
      );
    });

    it('returns undefined when hostname is unavailable', async () => {
      metadataStub.instance
        .withArgs('hostname')
        .rejects(new Error('not found'));

      const hostname = await gce.instanceHostname();
      assert.strictEqual(hostname, undefined);
    });
  });

  describe('managed instance group', () => {
    it('detects zonal MIG', async () => {
      metadataStub.instance
        .withArgs('attributes/created-by')
        .resolves(
          'projects/233510669999/zones/us-east4-b/instanceGroupManagers/my-zonal-mig'
        );

      const mig = await gce.managedInstanceGroup();
      assert.deepStrictEqual(mig, {
        name: 'my-zonal-mig',
        location: 'us-east4-b',
        type: 'zone',
      });
    });

    it('detects regional MIG', async () => {
      metadataStub.instance
        .withArgs('attributes/created-by')
        .resolves(
          'projects/233510669999/regions/us-east4/instanceGroupManagers/my-regional-mig'
        );

      const mig = await gce.managedInstanceGroup();
      assert.deepStrictEqual(mig, {
        name: 'my-regional-mig',
        location: 'us-east4',
        type: 'region',
      });
    });

    it('returns undefined when created-by is unavailable', async () => {
      metadataStub.instance
        .withArgs('attributes/created-by')
        .rejects(new Error('not found'));

      const mig = await gce.managedInstanceGroup();
      assert.strictEqual(mig, undefined);
    });

    it('returns undefined for unrecognized created-by format', async () => {
      for (const value of [
        '',
        'projects/233510669999/zones/us-east4-b/instanceGroups/not-a-mig',
        'projects/233510669999/global/instanceGroupManagers/invalid',
        'projects/233510669999/zones/us-east4-b/instanceGroupManagers/my-mig/extra',
      ]) {
        metadataStub.instance.withArgs('attributes/created-by').resolves(value);

        const mig = await gce.managedInstanceGroup();
        assert.strictEqual(mig, undefined);
      }
    });
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
