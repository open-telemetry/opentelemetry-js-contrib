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
import { dockerCGroupV1Detector } from '../src';
import {
  assertContainerResource,
  assertEmptyResource,
} from '@opentelemetry/contrib-test-utils';

import { DockerCGroupV1Detector } from '../src';

describe('dockerCGroupV1Detector', () => {
  let readStub, fileStub;
  const correctCgroupData =
    'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm';

  afterEach(() => {
    sinon.restore();
  });

  describe('Supported docker - Container ID ', () => {
    it('should return a container ID for supported docker - cgroup v1', async () => {
      fileStub = sinon
        .stub(DockerCGroupV1Detector, 'fileAccessAsync' as any)
        .resolves(undefined);

      const resource: Resource = await dockerCGroupV1Detector.detect();
      sinon.assert.calledOnce(fileStub);

      assert.ok(resource);
    });

    it('should return an empty resource for file access denied', async () => {
      fileStub = sinon
        .stub(DockerCGroupV1Detector, 'fileAccessAsync' as any)
        .rejects('permission denied');

      const resource: Resource = await dockerCGroupV1Detector.detect();
      sinon.assert.calledOnce(fileStub);
      assert.ok(resource);
    });

    it('should return a resource with container ID with a valid container ID present', async () => {
      fileStub = sinon
        .stub(DockerCGroupV1Detector, 'fileAccessAsync' as any)
        .resolves();
      readStub = sinon
        .stub(DockerCGroupV1Detector, 'readFileAsync' as any)
        .resolves(correctCgroupData);

      const resource: Resource = await dockerCGroupV1Detector.detect();

      sinon.assert.calledOnce(fileStub);
      sinon.assert.calledOnce(readStub);

      assert.ok(resource);
      assertContainerResource(resource, {
        id: 'bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm',
      });
    });

    it('should return a resource with clusterName attribute when cgroup file does not contain valid Container ID', async () => {
      fileStub = sinon
        .stub(DockerCGroupV1Detector, 'fileAccessAsync' as any)
        .resolves();
      readStub = sinon
        .stub(DockerCGroupV1Detector, 'readFileAsync' as any)
        .onSecondCall()
        .resolves('');

      const resource: Resource = await dockerCGroupV1Detector.detect();

      sinon.assert.calledOnce(fileStub);
      sinon.assert.calledOnce(readStub);

      assert.ok(resource);
    });

    it('should return an empty resource when containerId is not valid', async () => {
      const errorMsg = {
        fileNotFoundError: new Error('cannot file in the path}'),
      };
      fileStub = sinon
        .stub(DockerCGroupV1Detector, 'fileAccessAsync' as any)
        .resolves('');
      readStub = sinon
        .stub(DockerCGroupV1Detector, 'readFileAsync' as any)
        .onSecondCall()
        .rejects(errorMsg);

      const resource: Resource = await dockerCGroupV1Detector.detect();

      sinon.assert.calledOnce(fileStub);
      sinon.assert.calledOnce(readStub);

      assertEmptyResource(resource);
    });
  });
});
