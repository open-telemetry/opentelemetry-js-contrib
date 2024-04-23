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
    it('should return an empty Resource when not in a k8s environment', async () => {
      const containerDetector = new ContainerDetector();
      sinon
        .stub(containerDetector, '_isInKubernetesEnvironment' as any)
        .returns(false);

      const resource: Resource = await containerDetector.detect();
      assertEmptyResource(resource);
      sinon.restore();
    });

    it('should return a Resource with container ID when running in a Kubernetes environment', async () => {
      // Stub _isInKubernetesEnvironment to return true
      const containerDetector = new ContainerDetector();
      sinon
        .stub(containerDetector, '_isInKubernetesEnvironment' as any)
        .returns(true);
      // Stub _getContainerIdK8 to return a mock container ID
      sinon
        .stub(containerDetector, '_getContainerIdK8' as any)
        .resolves(correctCgroupV1Data);

      const resource: Resource = await containerDetector.detect();
      assert.ok(resource);
      assertContainerResource(resource, {
        id: 'bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm',
      });
      sinon.restore();
    });

    it('should return an error with no CONTAINER_NAME environment variable defined', async () => {
      const containerDetector = new ContainerDetector();
      sinon
        .stub(containerDetector, '_isInKubernetesEnvironment' as any)
        .returns(true);
      const k8Stub = sinon.spy(
        ContainerDetector.prototype,
        '_getContainerIdK8' as any
      );
      try {
        await k8Stub();
      } catch (error: any) {
        assert.strictEqual(
          error.message,
          'Container name not specified in environment'
        );
      } finally {
        k8Stub.restore();
      }
    });

    it('should throw "no pod found" for wrong container name', async () => {
      process.env.CONTAINER_NAME = 'my-container';
      const containerDetector = new ContainerDetector();
      sinon
        .stub(containerDetector, '_isInKubernetesEnvironment' as any)
        .returns(true);
      const k8Stub = sinon.spy(
        ContainerDetector.prototype,
        '_getContainerIdK8' as any
      );
      const listNamespacePodStub = sinon.stub().resolves({
        body: {
          items: [
            {
              spec: {
                containers: [{ name: 'container1' }, { name: 'container2' }],
              },
            },
          ],
        },
      });

      const apiStub = {
        listNamespacePod: listNamespacePodStub,
      };
      const kubeconfig = new KubeConfig();
      kubeconfig.loadFromDefault();

      const makeApiClientStub = sinon
        .stub(KubeConfig.prototype, 'makeApiClient')
        .returns(apiStub as any);
      try {
        await k8Stub();
        assert(listNamespacePodStub.calledOnceWithExactly('default'));
        assert(makeApiClientStub.calledOnce);
      } catch (error: any) {
        assert.strictEqual(
          error.message,
          "No pods found with container name 'my-container'."
        );
      } finally {
        k8Stub.restore();
      }
    });

    it('should return a containerId for right container name', async () => {
      process.env.CONTAINER_NAME = 'container1';
      const containerDetector = new ContainerDetector();
      sinon
        .stub(containerDetector, '_isInKubernetesEnvironment' as any)
        .returns(true);
      const k8Stub = sinon.spy(
        ContainerDetector.prototype,
        '_getContainerIdK8' as any
      );
      const listNamespacePodStub = sinon.stub().resolves({
        body: {
          items: [
            {
              spec: {
                containers: [
                  { name: 'container1', containerID: correctCgroupV1Data },
                  { name: 'container2' },
                ],
              },
            },
          ],
        },
      });

      const apiStub = {
        listNamespacePod: listNamespacePodStub,
      };
      const kubeconfig = new KubeConfig();
      kubeconfig.loadFromDefault();

      const makeApiClientStub = sinon
        .stub(KubeConfig.prototype, 'makeApiClient')
        .returns(apiStub as any);
      try {
        const cid = await k8Stub();
        assert(listNamespacePodStub.calledOnceWithExactly('default'));
        assert(makeApiClientStub.calledOnce);
        assert.strictEqual(cid, correctCgroupV1Data);
      } finally {
        k8Stub.restore();
      }
    });
  });
});
