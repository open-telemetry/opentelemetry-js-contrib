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

    it('should return a correctCgroupV2Data resource with v1Detector returns empty string ', async () => {
      readStub = sinon.stub(ContainerDetector, 'readFileAsync' as any);
      sinon.stub(containerDetector, '_getContainerIdV1' as any).resolves('');
      sinon
        .stub(containerDetector, '_getContainerIdV2' as any)
        .resolves(correctCgroupV2Data);
      const containerId = await containerDetector['_getContainerId']();
      assert.strictEqual(containerId, correctCgroupV2Data);
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
});
