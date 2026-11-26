/*
 * Copyright The OpenTelemetry Authors
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon';
import * as metadata from 'gcp-metadata';

import * as faas from '../../src/detectors/faas';
import * as assert from 'assert';
import { BigNumber } from 'bignumber.js';

describe('FaaS (Cloud Run/Functions)', () => {
  let metadataStub: sinon.SinonStubbedInstance<typeof metadata>;
  let envStub: NodeJS.ProcessEnv;
  beforeEach(() => {
    metadataStub = sinon.stub(metadata);
    envStub = sinon.replace(process, 'env', {});
  });

  afterEach(() => {
    sinon.restore();
  });

  it('detects when running on Cloud Run', async () => {
    envStub.K_CONFIGURATION = 'fake-configuration';
    const onCloudRun = await faas.onCloudRun();
    assert(onCloudRun);
  });
  it('detects when not running on Cloud Run', async () => {
    const onCloudRun = await faas.onCloudRun();
    assert(!onCloudRun);
  });

  it('detects when running on Cloud Functions', async () => {
    envStub.FUNCTION_TARGET = 'fake-function-target';
    const onCloudFunctions = await faas.onCloudFunctions();
    assert(onCloudFunctions);
  });
  it('detects when not running on Cloud Functions', async () => {
    const onCloudFunctions = await faas.onCloudFunctions();
    assert(!onCloudFunctions);
  });

  it('detects FaaS name', async () => {
    envStub.K_SERVICE = 'fake-service';
    const faasName = await faas.faasName();
    assert.strictEqual(faasName, 'fake-service');
  });

  it('detects FaaS version', async () => {
    envStub.K_REVISION = 'fake-revision';
    const faasVersion = await faas.faasVersion();
    assert.strictEqual(faasVersion, 'fake-revision');
  });

  describe('detects FaaS id', () => {
    it('as a number', async () => {
      metadataStub.instance.withArgs('id').resolves(12345);

      const faasInstance = await faas.faasInstance();
      assert.strictEqual(faasInstance, '12345');
    });

    it('as a BigNumber', async () => {
      metadataStub.instance
        .withArgs('id')
        .resolves(new BigNumber('2459451723172637654'));

      const faasInstance = await faas.faasInstance();
      assert.strictEqual(faasInstance, '2459451723172637654');
    });
  });

  it('detects FaaS region', async () => {
    metadataStub.instance
      .withArgs('region')
      .resolves('projects/233510669999/regions/us-east4');

    const faasRegion = await faas.faasCloudRegion();
    assert.deepStrictEqual(faasRegion, 'us-east4');
  });
});
