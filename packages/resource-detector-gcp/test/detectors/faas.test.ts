/*
 * Copyright 2023 Google LLC
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
