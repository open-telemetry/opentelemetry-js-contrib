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
  let readStub: sinon.SinonStub;
  const correctCgroupV1Data =
    '12:pids:/kubepods.slice/4e6f77206973207468652074696d6520666f7220616c6c20676f6f64206d656e20746f20636f6d6520746f2074686520616964';
  const correctCgroupV2Data = `containers/tmhdefghijklmnopqrstuvwxyzafgrefghiugkmnopqrstuvwxyzabcdefghijkl/hostname
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
        id: '4e6f77206973207468652074696d6520666f7220616c6c20676f6f64206d656e20746f20636f6d6520746f2074686520616964',
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

    describe(' extractContainerId from line tests', () => {
      const containerDetector = new ContainerDetector();
      it('should extract container ID from crio-prefixed line', () => {
        const line =
          '11:devices:/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod5c5979ec_6b2b_11e9_a923_42010a800002.slice/crio-1234567890abcdef.scope';
        const expected = '1234567890abcdef';
        assert.strictEqual(
          containerDetector['extractContainerIdFromLine'](line),
          expected
        );
      });

      it('should extract container ID from docker-prefixed line', () => {
        const line =
          '11:devices:/docker/1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        const expected =
          '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        assert.strictEqual(
          containerDetector['extractContainerIdFromLine'](line),
          expected
        );
      });

      it('should extract container ID from cri-containerd-prefixed line', () => {
        const line =
          '11:devices:/kubepods/burstable/pod2c4b2241-5c01-11e9-8e4e-42010a800002/cri-containerd-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        const expected =
          '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        assert.strictEqual(
          containerDetector['extractContainerIdFromLine'](line),
          expected
        );
      });

      it('should handle containerd v1.5.0+ format with systemd cgroup driver', () => {
        const line =
          '0::/system.slice/containerd.service/kubepods-burstable-pod2c4b2241-5c01-11e9-8e4e-42010a800002.slice:cri-containerd:1234567890abcdef';
        const expected = '1234567890abcdef';
        assert.strictEqual(
          containerDetector['extractContainerIdFromLine'](line),
          expected
        );
      });

      it('should return null for invalid container ID', () => {
        const line =
          '11:devices:/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod5c5979ec_6b2b_11e9_a923_42010a800002.slice/invalid-id.scope';
        assert.strictEqual(
          containerDetector['extractContainerIdFromLine'](line),
          null
        );
      });

      it('should return null for empty line', () => {
        const line = '';
        assert.strictEqual(
          containerDetector['extractContainerIdFromLine'](line),
          null
        );
      });

      it('should return null for line without container ID', () => {
        const line = '11:devices:/';
        assert.strictEqual(
          containerDetector['extractContainerIdFromLine'](line),
          null
        );
      });
    });
  });
});
