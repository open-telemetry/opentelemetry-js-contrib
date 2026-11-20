/*
 * Copyright The OpenTelemetry Authors
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon';
import * as metadata from 'gcp-metadata';

import { gcpDetector } from '../../src/';
import { detectResources, Resource } from '@opentelemetry/resources';
import * as assert from 'assert';

async function detectAndWait(): Promise<Resource> {
  const resource = detectResources({ detectors: [gcpDetector] });
  await resource.waitForAsyncAttributes?.();
  return resource;
}

describe('gcpDetector', () => {
  let metadataStub: sinon.SinonStubbedInstance<typeof metadata>;
  let envStub: NodeJS.ProcessEnv;
  beforeEach(() => {
    metadataStub = sinon.stub(metadata);
    metadataStub.isAvailable.resolves(true);
    metadataStub.project.withArgs('project-id').resolves('fake-project-id');

    envStub = sinon.replace(process, 'env', {});
  });

  afterEach(() => {
    sinon.restore();
  });

  it('returns empty resource when metadata server is not available', async () => {
    metadataStub.isAvailable.resolves(false);
    const resource = await detectAndWait();
    assert.deepStrictEqual(resource.attributes, {});
  });

  describe('detects a GKE resource', () => {
    beforeEach(() => {
      envStub.KUBERNETES_SERVICE_HOST = 'fake-service-host';
      metadataStub.instance
        .withArgs('id')
        .resolves(12345)

        .withArgs('attributes/cluster-name')
        .resolves('fake-cluster-name');
    });

    it('zonal', async () => {
      metadataStub.instance
        .withArgs('attributes/cluster-location')
        .resolves('us-east4-b');
      const resource = await detectAndWait();
      assert.deepStrictEqual(resource.attributes, {
        'cloud.account.id': 'fake-project-id',
        'cloud.availability_zone': 'us-east4-b',
        'cloud.platform': 'gcp_kubernetes_engine',
        'cloud.provider': 'gcp',
        'host.id': '12345',
        'k8s.cluster.name': 'fake-cluster-name',
      });
    });

    it('regional', async () => {
      metadataStub.instance
        .withArgs('attributes/cluster-location')
        .resolves('us-east4');
      const resource = await detectAndWait();
      assert.deepStrictEqual(resource.attributes, {
        'cloud.account.id': 'fake-project-id',
        'cloud.platform': 'gcp_kubernetes_engine',
        'cloud.provider': 'gcp',
        'cloud.region': 'us-east4',
        'host.id': '12345',
        'k8s.cluster.name': 'fake-cluster-name',
      });
    });
  });

  describe('detects a GCE resource', () => {
    beforeEach(() => {
      metadataStub.instance
        .withArgs('id')
        .resolves(12345)

        .withArgs('machine-type')
        .resolves('fake-machine-type')

        .withArgs('name')
        .resolves('fake-name')

        .withArgs('hostname')
        .resolves('fake-name.us-east4-b.c.fake-project-id.internal')

        .withArgs('zone')
        .resolves('projects/233510669999/zones/us-east4-b')

        .withArgs('attributes/created-by')
        .rejects(new Error('not found'));
    });

    it('standalone VM', async () => {
      const resource = await detectAndWait();
      assert.deepStrictEqual(resource.attributes, {
        'cloud.account.id': 'fake-project-id',
        'cloud.availability_zone': 'us-east4-b',
        'cloud.platform': 'gcp_compute_engine',
        'cloud.provider': 'gcp',
        'cloud.region': 'us-east4',
        'gcp.gce.instance.hostname':
          'fake-name.us-east4-b.c.fake-project-id.internal',
        'gcp.gce.instance.name': 'fake-name',
        'host.id': '12345',
        'host.name': 'fake-name',
        'host.type': 'fake-machine-type',
      });
    });

    it('standalone VM without hostname', async () => {
      metadataStub.instance
        .withArgs('hostname')
        .rejects(new Error('not found'));

      const resource = await detectAndWait();
      assert.deepStrictEqual(resource.attributes, {
        'cloud.account.id': 'fake-project-id',
        'cloud.availability_zone': 'us-east4-b',
        'cloud.platform': 'gcp_compute_engine',
        'cloud.provider': 'gcp',
        'cloud.region': 'us-east4',
        'gcp.gce.instance.name': 'fake-name',
        'host.id': '12345',
        'host.name': 'fake-name',
        'host.type': 'fake-machine-type',
      });
    });

    it('zonal MIG', async () => {
      metadataStub.instance
        .withArgs('attributes/created-by')
        .resolves(
          'projects/233510669999/zones/us-east4-b/instanceGroupManagers/my-zonal-mig'
        );

      const resource = await detectAndWait();
      assert.deepStrictEqual(resource.attributes, {
        'cloud.account.id': 'fake-project-id',
        'cloud.availability_zone': 'us-east4-b',
        'cloud.platform': 'gcp_compute_engine',
        'cloud.provider': 'gcp',
        'cloud.region': 'us-east4',
        'gcp.gce.instance.hostname':
          'fake-name.us-east4-b.c.fake-project-id.internal',
        'gcp.gce.instance.name': 'fake-name',
        'gcp.gce.instance_group_manager.name': 'my-zonal-mig',
        'gcp.gce.instance_group_manager.zone': 'us-east4-b',
        'host.id': '12345',
        'host.name': 'fake-name',
        'host.type': 'fake-machine-type',
      });
    });

    it('regional MIG', async () => {
      metadataStub.instance
        .withArgs('attributes/created-by')
        .resolves(
          'projects/233510669999/regions/us-east4/instanceGroupManagers/my-regional-mig'
        );

      const resource = await detectAndWait();
      assert.deepStrictEqual(resource.attributes, {
        'cloud.account.id': 'fake-project-id',
        'cloud.availability_zone': 'us-east4-b',
        'cloud.platform': 'gcp_compute_engine',
        'cloud.provider': 'gcp',
        'cloud.region': 'us-east4',
        'gcp.gce.instance.hostname':
          'fake-name.us-east4-b.c.fake-project-id.internal',
        'gcp.gce.instance.name': 'fake-name',
        'gcp.gce.instance_group_manager.name': 'my-regional-mig',
        'gcp.gce.instance_group_manager.region': 'us-east4',
        'host.id': '12345',
        'host.name': 'fake-name',
        'host.type': 'fake-machine-type',
      });
    });
  });

  it('detects a Cloud Run resource', async () => {
    envStub.K_CONFIGURATION = 'fake-configuration';
    envStub.K_SERVICE = 'fake-service';
    envStub.K_REVISION = 'fake-revision';
    metadataStub.instance
      .withArgs('id')
      .resolves(12345)

      .withArgs('region')
      .resolves('projects/233510669999/regions/us-east4');

    const resource = await detectAndWait();
    assert.deepStrictEqual(resource.attributes, {
      'cloud.account.id': 'fake-project-id',
      'cloud.platform': 'gcp_cloud_run',
      'cloud.provider': 'gcp',
      'cloud.region': 'us-east4',
      'faas.instance': '12345',
      'faas.name': 'fake-service',
      'faas.version': 'fake-revision',
    });
  });

  it('detects a Cloud Functions resource', async () => {
    envStub.FUNCTION_TARGET = 'fake-function-target';
    envStub.K_SERVICE = 'fake-service';
    envStub.K_REVISION = 'fake-revision';
    metadataStub.instance
      .withArgs('id')
      .resolves(12345)

      .withArgs('region')
      .resolves('projects/233510669999/regions/us-east4');

    const resource = await detectAndWait();
    assert.deepStrictEqual(resource.attributes, {
      'cloud.account.id': 'fake-project-id',
      'cloud.platform': 'gcp_cloud_functions',
      'cloud.provider': 'gcp',
      'cloud.region': 'us-east4',
      'faas.instance': '12345',
      'faas.name': 'fake-service',
      'faas.version': 'fake-revision',
    });
  });

  it('detects a App Engine Standard resource', async () => {
    envStub.GAE_ENV = 'standard';
    envStub.GAE_SERVICE = 'fake-service';
    envStub.GAE_VERSION = 'fake-version';
    envStub.GAE_INSTANCE = 'fake-instance';
    metadataStub.instance.withArgs('zone').resolves('us-east4-b');
    metadataStub.instance
      .withArgs('region')
      .resolves('projects/233510669999/regions/us-east4');

    const resource = await detectAndWait();
    assert.deepStrictEqual(resource.attributes, {
      'cloud.account.id': 'fake-project-id',
      'cloud.availability_zone': 'us-east4-b',
      'cloud.platform': 'gcp_app_engine',
      'cloud.provider': 'gcp',
      'cloud.region': 'us-east4',
      'faas.instance': 'fake-instance',
      'faas.name': 'fake-service',
      'faas.version': 'fake-version',
    });
  });

  it('detects a App Engine Flex resource', async () => {
    envStub.GAE_SERVICE = 'fake-service';
    envStub.GAE_VERSION = 'fake-version';
    envStub.GAE_INSTANCE = 'fake-instance';
    metadataStub.instance
      .withArgs('zone')
      .resolves('projects/233510669999/zones/us-east4-b');

    const resource = await detectAndWait();
    assert.deepStrictEqual(resource.attributes, {
      'cloud.account.id': 'fake-project-id',
      'cloud.availability_zone': 'us-east4-b',
      'cloud.platform': 'gcp_app_engine',
      'cloud.provider': 'gcp',
      'cloud.region': 'us-east4',
      'faas.instance': 'fake-instance',
      'faas.name': 'fake-service',
      'faas.version': 'fake-version',
    });
  });

  it('detects empty resource when nothing else can be detected', async () => {
    // gcp-metadata throws when it can't access the metadata server
    metadataStub.instance.rejects();
    metadataStub.project.rejects();

    const resource = await detectAndWait();
    assert.deepStrictEqual(resource.attributes, {});
  });
});
