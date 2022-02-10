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

import * as nock from 'nock';
import * as sinon from 'sinon';
import * as assert from 'assert';
import { Resource } from '@opentelemetry/resources';
import { dockercgroupDetector } from '../src';
import {
  assertContainerResource,
  assertEmptyResource,
} from '@opentelemetry/contrib-test-utils';
import { DockercgroupDetector } from '../src';

describe('dockercgroupDetector', () => {
  const errorMsg = {
    fileNotFoundError: new Error('cannot find cgroup file'),
  };

  const correctCgroupData =
    'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm';
  let readStub, fileStub;

  beforeEach(() => {
    nock.disableNetConnect();
    nock.cleanAll();
  });

  afterEach(() => {
    sinon.restore();
    nock.enableNetConnect();
  });

  describe('Supported docker - Container ID ', () => {
    it('should return a container ID for supported docker - cgroup v1', async () => {
      fileStub = sinon
        .stub(DockercgroupDetector, 'fileAccessAsync' as any)
        .resolves(undefined);

      const resource: Resource = await dockercgroupDetector.detect();

      assert.ok(resource);
    });

    it('should return an empty resource for file access denied', async () => {
      fileStub = sinon
        .stub(DockercgroupDetector, 'fileAccessAsync' as any)
        .rejects('permission denied');

      const resource: Resource = await dockercgroupDetector.detect();

      assert.ok(resource);
    });

    it('should return a resource with container ID with a valid container ID present', async () => {
      fileStub = sinon
        .stub(DockercgroupDetector, 'fileAccessAsync' as any)
        .resolves();
      readStub = sinon
        .stub(DockercgroupDetector, 'readFileAsync' as any)
        .resolves(correctCgroupData);

      const resource: Resource = await dockercgroupDetector.detect();

      assert.ok(resource);
      assertContainerResource(resource, {
        id: 'bcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklm',
      });
    });

    it('should return a resource with clusterName attribute when cgroup file does not contain valid Container ID', async () => {
      fileStub = sinon
        .stub(DockercgroupDetector, 'fileAccessAsync' as any)
        .resolves();
      readStub = sinon
        .stub(DockercgroupDetector, 'readFileAsync' as any)
        .onSecondCall()
        .resolves('');

      const resource: Resource = await dockercgroupDetector.detect();

      assert.ok(resource);
    });

    it('should return an empty resource when containerId is not valid', async () => {
      const errorMsg = {
        fileNotFoundError: new Error('cannot file in the path}'),
      };
      fileStub = sinon
        .stub(DockercgroupDetector, 'fileAccessAsync' as any)
        .resolves('');
      readStub = sinon
        .stub(DockercgroupDetector, 'readFileAsync' as any)
        .onSecondCall()
        .rejects(errorMsg);

      const resource: Resource = await dockercgroupDetector.detect();
      assertEmptyResource(resource);
    });
  });
});
