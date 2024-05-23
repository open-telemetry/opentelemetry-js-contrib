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

import * as sinon from 'sinon';
import * as assert from 'assert';
import * as fs from 'fs';
import * as https from 'https';
import { Resource } from '@opentelemetry/resources';
import { containerDetector } from '../src';
import {
  assertContainerResource,
  assertEmptyResource,
} from '@opentelemetry/contrib-test-utils';
import { KubeConfig } from '@kubernetes/client-node';

import { ContainerDetector } from '../src';

describe('ContainerDetector', () => {
  let readStub;
  const correctCgroupV1Data =
    '12:pids:/kubepods.slice/bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm';
  const correctCgroupV2Data = `tmhdefghijklmnopqrstuvwxyzafgrefghiugkmnopqrstuvwxyzabcdefghijkl/hostname
    fhkjdshgfhsdfjhdsfkjhfkdshkjhfd/host
    sahfhfjkhjhfhjdhfjkdhfkjdhfjkhhdsjfhdfhjdhfkj/somethingelse`;
  const k8ContainerIdExpected = 'bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm';
  const wrongCgroupV2Data =
    'bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm/wrongkeyword';

  afterEach(() => {
    sinon.restore();
  });

  describe('Supported container - Container ID ', () => {
    it('should return a resource attributes without container id - docker cgroup v1 detector', async () => {
      readStub = sinon
        .stub(ContainerDetector, 'readFileAsync' as any)
        .resolves(undefined);

      const resource: Resource = await containerDetector.detect();

      assert.deepStrictEqual(resource.attributes, {});
      assert.ok(resource);
    });

    it('should return a resource with container ID with a valid container ID present', async () => {
      readStub = sinon
        .stub(ContainerDetector, 'readFileAsync' as any)
        .resolves(correctCgroupV1Data);

      const resource: Resource = await containerDetector.detect();

      sinon.assert.calledOnce(readStub);

      assert.ok(resource);
      assertContainerResource(resource, {
        id: 'bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm',
      });
    });

    it('should return a resource with container ID with a valid container ID present for v2', async () => {
      readStub = sinon.stub(ContainerDetector, 'readFileAsync' as any);

      readStub.onFirstCall().resolves('');
      readStub.onSecondCall().resolves(correctCgroupV2Data);

      const resource: Resource = await containerDetector.detect();
      sinon.assert.calledTwice(readStub);

      assert.ok(resource);
      assertContainerResource(resource, {
        id: 'tmhdefghijklmnopqrstuvwxyzafgrefghiugkmnopqrstuvwxyzabcdefghijkl',
      });
    });

    it('should return a empty resource with failed hostname check for v2', async () => {
      readStub = sinon.stub(ContainerDetector, 'readFileAsync' as any);

      readStub.onFirstCall().resolves('');
      readStub.onSecondCall().resolves(wrongCgroupV2Data);

      const resource: Resource = await containerDetector.detect();
      sinon.assert.calledTwice(readStub);

      assert.ok(resource);
    });

    it('should return a resource without attribute container.id when cgroup file does not contain valid Container ID', async () => {
      readStub = sinon
        .stub(ContainerDetector, 'readFileAsync' as any)
        .resolves('');

      const resource: Resource = await containerDetector.detect();
      assert.deepStrictEqual(resource.attributes, {});

      sinon.assert.calledTwice(readStub);
      assert.ok(resource);
    });

    it('should return an empty resource when containerId is not valid', async () => {
      const errorMsg = {
        fileNotFoundError: new Error('cannot find file in path'),
      };

      readStub = sinon
        .stub(ContainerDetector, 'readFileAsync' as any)
        .rejects(errorMsg.fileNotFoundError);

      const resource: Resource = await containerDetector.detect();

      sinon.assert.calledOnce(readStub);
      assertEmptyResource(resource);
    });

    //cgroup v2 and containerd test

    it('should return an empty resource when containerId is not valid', async () => {
      const errorMsg = {
        fileNotFoundError: new Error('cannot find file in path'),
      };

      readStub = sinon
        .stub(ContainerDetector, 'readFileAsync' as any)
        .rejects(errorMsg.fileNotFoundError);

      const resource: Resource = await containerDetector.detect();
      sinon.assert.calledOnce(readStub);
      assertEmptyResource(resource);
    });
  });

  describe('Detect containerId in k8s environment', () => {
    let readFileSyncStub: sinon.SinonStub;
    let fetchKubernetesApiStub: sinon.SinonStub;
    let env: NodeJS.ProcessEnv;

    beforeEach(() => {
      readFileSyncStub = sinon.stub(fs, 'readFileSync');
      fetchKubernetesApiStub = sinon.stub(containerDetector, 'fetchKubernetesApi');
      process.env = { ...env }; // Reset environment variables

      // Stub the file reads with mock values
      readFileSyncStub.withArgs(containerDetector.K8_NAMESPACE_PATH).returns('test-namespace');
      readFileSyncStub.withArgs(containerDetector.K8_TOKEN_PATH).returns('mock-token');
      readFileSyncStub.withArgs(containerDetector.K8_CERTIFICATE_PATH).returns('mock-certificate');
    });
    it('should return an empty Resource when not in a k8s environment', async () => {
      // const containerDetector = new ContainerDetector();
      sinon
        .stub(fs, 'accessSync' as any)
        .returns(false);

      const resource: Resource = await containerDetector.detect();
      assertEmptyResource(resource);
      sinon.restore();
    });

    it('should return a Resource with container ID when running in a Kubernetes environment', async () => {
      // Stub _isInKubernetesEnvironment to return true
      const containerDetector = new ContainerDetector();
      sinon
        .stub(fs, 'accessSync' as any)
        .returns(true);

      sinon
        .stub(containerDetector, 'fetchKubernetesApi' as any)
        .resolves({});
      // Stub _getContainerIdK8 to return a mock container ID
      sinon
        .stub(containerDetector, '_getContainerIdK8' as any)
        .resolves(k8ContainerIdExpected);

      const resource: Resource = await containerDetector.detect();
      assert.ok(resource);
      assertContainerResource(resource, {
        id: 'bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm',
      });
      sinon.restore();
    });

    it('should throw an error if container name is not found in pod', async () => {
      process.env.POD_NAME = 'test-pod';
      process.env.CONTAINER_NAME = 'test-container';
      const podData = {
        status: {
          containerStatuses: [{ name: 'other-container', containerID: 'container-id-123' }],
        },
      };
      fetchKubernetesApiStub.resolves(podData);

      await assert.rejects(
        async () => {
          await containerDetector['_getContainerIdK8']();
        },
        Error,
        'Container "test-container" not found in pod "test-pod".'
      );
    });

    it('should loop through all pods if POD_NAME is not provided and return the container ID', async () => {
      // Notice that we're not setting process.env.POD_NAME here
      process.env.CONTAINER_NAME = 'test-container';
      const expectedContainerID = 'container-id-123';
      const podData = {
        items: [{
          status: {
            containerStatuses: [
              { name: 'test-container', containerID: `docker://${expectedContainerID}` }
            ],
          },
        }],
      };
      fetchKubernetesApiStub.resolves(podData);

      // Call the private method using bracket notation and await its result
      const containerId = await containerDetector['_getContainerIdK8']();

      // Use assert to check if the container ID returned from the method matches the expected value
      assert.strictEqual(containerId, expectedContainerID);
    });
    it('should return the correct RequestOptions object', async () => {
      process.env.KUBERNETES_SERVICE_HOST = 'K8-service-host';
      const path = '/api/v1/namespaces/default/pods';
  
      const requestOptions = await containerDetector['getKubernetesApiOptions'](path);
  
      assert.deepEqual(requestOptions, {
        hostname: 'K8-service-host',
        port: 443,
        path: path,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock-token',
        },
        ca: 'mock-certificate',
      });
    });
  });
});
