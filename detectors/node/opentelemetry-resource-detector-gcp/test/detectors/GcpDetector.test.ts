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

import * as http from 'http';
import * as assert from 'assert';

import {
  BASE_PATH,
  HEADER_NAME,
  HEADER_VALUE,
  HOST_ADDRESS,
  SECONDARY_HOST_ADDRESS,
  resetIsAvailableCache,
} from 'gcp-metadata';
import * as nock from 'nock';
import { gcpDetector } from '../../src';
import {
  assertCloudResource,
  assertHostResource,
  assertK8sResource,
  assertContainerResource,
  assertEmptyResource,
  runTestFixture,
} from '@opentelemetry/contrib-test-utils';

const HEADERS = {
  [HEADER_NAME.toLowerCase()]: HEADER_VALUE,
};
const INSTANCE_PATH = BASE_PATH + '/instance';
const INSTANCE_ID_PATH = BASE_PATH + '/instance/id';
const PROJECT_ID_PATH = BASE_PATH + '/project/project-id';
const ZONE_PATH = BASE_PATH + '/instance/zone';
const CLUSTER_NAME_PATH = BASE_PATH + '/instance/attributes/cluster-name';
const HOSTNAME_PATH = BASE_PATH + '/instance/hostname';

describe('gcpDetector', () => {
  describe('.detect', () => {
    before(() => {
      nock.disableNetConnect();
    });

    after(() => {
      nock.enableNetConnect();
      delete process.env.KUBERNETES_SERVICE_HOST;
      delete process.env.NAMESPACE;
      delete process.env.CONTAINER_NAME;
      delete process.env.HOSTNAME;
    });

    beforeEach(() => {
      resetIsAvailableCache();
      nock.cleanAll();
      delete process.env.KUBERNETES_SERVICE_HOST;
      delete process.env.NAMESPACE;
      delete process.env.CONTAINER_NAME;
      delete process.env.HOSTNAME;
    });

    it('should return resource with GCP metadata', async () => {
      const scope = nock(HOST_ADDRESS)
        .get(INSTANCE_PATH)
        .reply(200, {}, HEADERS)
        .get(INSTANCE_ID_PATH)
        // This number is too large to be safely represented by a JS number
        // See https://github.com/googleapis/gcp-metadata/tree/fc2f0778138b36285643b2f716c485bf9614611f#take-care-with-large-number-valued-properties
        .reply(200, () => '4520031799277581759', HEADERS)
        .get(PROJECT_ID_PATH)
        .reply(200, () => 'my-project-id', HEADERS)
        .get(ZONE_PATH)
        .reply(200, () => 'project/zone/my-zone', HEADERS)
        .get(CLUSTER_NAME_PATH)
        .reply(404)
        .get(HOSTNAME_PATH)
        .reply(200, () => 'dev.my-project.local', HEADERS);
      const secondaryScope = nock(SECONDARY_HOST_ADDRESS)
        .get(INSTANCE_PATH)
        .reply(200, {}, HEADERS);

      const resource = gcpDetector.detect();
      await resource.waitForAsyncAttributes?.();

      secondaryScope.done();
      scope.done();

      assertCloudResource(resource, {
        provider: 'gcp',
        accountId: 'my-project-id',
        zone: 'my-zone',
      });
      assertHostResource(resource, {
        id: '4520031799277581759',
        name: 'dev.my-project.local',
      });
    });

    it('should populate K8s attributes when KUBERNETES_SERVICE_HOST is set', async () => {
      process.env.KUBERNETES_SERVICE_HOST = 'my-host';
      process.env.NAMESPACE = 'my-namespace';
      process.env.HOSTNAME = 'my-hostname';
      process.env.CONTAINER_NAME = 'my-container-name';
      const scope = nock(HOST_ADDRESS)
        .get(INSTANCE_PATH)
        .reply(200, {}, HEADERS)
        .get(INSTANCE_ID_PATH)
        .reply(200, () => '4520031799277581759', HEADERS)
        .get(CLUSTER_NAME_PATH)
        .reply(200, () => 'my-cluster', HEADERS)
        .get(PROJECT_ID_PATH)
        .reply(200, () => 'my-project-id', HEADERS)
        .get(ZONE_PATH)
        .reply(200, () => 'project/zone/my-zone', HEADERS)
        .get(HOSTNAME_PATH)
        .reply(200, () => 'dev.my-project.local', HEADERS);
      const secondaryScope = nock(SECONDARY_HOST_ADDRESS)
        .get(INSTANCE_PATH)
        .reply(200, {}, HEADERS);

      const resource = gcpDetector.detect();
      await resource.waitForAsyncAttributes?.();

      secondaryScope.done();
      scope.done();

      assertCloudResource(resource, {
        provider: 'gcp',
        accountId: 'my-project-id',
        zone: 'my-zone',
      });
      assertK8sResource(resource, {
        clusterName: 'my-cluster',
        podName: 'my-hostname',
        namespaceName: 'my-namespace',
      });
      assertContainerResource(resource, { name: 'my-container-name' });
    });

    it('should return resource and empty data for non-available metadata attributes', async () => {
      const scope = nock(HOST_ADDRESS)
        .get(INSTANCE_PATH)
        .reply(200, {}, HEADERS)
        .get(PROJECT_ID_PATH)
        .reply(200, () => 'my-project-id', HEADERS)
        .get(ZONE_PATH)
        .reply(413)
        .get(INSTANCE_ID_PATH)
        .reply(400, undefined, HEADERS)
        .get(CLUSTER_NAME_PATH)
        .reply(413)
        .get(HOSTNAME_PATH)
        .reply(400, undefined, HEADERS);
      const secondaryScope = nock(SECONDARY_HOST_ADDRESS)
        .get(INSTANCE_PATH)
        .reply(200, {}, HEADERS);

      const resource = gcpDetector.detect();
      await resource.waitForAsyncAttributes?.();

      secondaryScope.done();
      scope.done();

      assertCloudResource(resource, {
        provider: 'gcp',
        accountId: 'my-project-id',
        zone: '',
      });
    });

    it('returns empty resource if not detected', async () => {
      const resource = gcpDetector.detect();
      await resource.waitForAsyncAttributes?.();

      assertEmptyResource(resource);
    });
  });

  describe('internal tracing', () => {
    it('should not export traces related to GCP detection', async () => {
      const gcpServer = http.createServer((req,res) => {
        const responseMap: Record<string, string> = {
          [INSTANCE_PATH]: '{}',
          [INSTANCE_ID_PATH]: '4520031799277581759',
          [PROJECT_ID_PATH]: 'my-project-id',
          [ZONE_PATH]: 'project/zone/my-zone',
          [CLUSTER_NAME_PATH]: 'my-cluster',
          [HOSTNAME_PATH]: 'dev.my-project.local',
        };
        req.resume();
        req.on('end', function () {
          const body = responseMap[req.url!] || '';
          res.writeHead(200, {...HEADERS, 'content-type': body === '{}' ? 'application/json' : 'text/plain'});
          res.end(body);
        });
      });
      const port = await new Promise(resolve => {
        gcpServer.listen(0, '127.0.0.1', function () {
          resolve((gcpServer.address() as any).port);
        });
      });

      await runTestFixture({
        cwd: __dirname,
        argv: ['../fixtures/use-gcp-detector.js'],
        env: {
          // We setup `gcp-metadata` to request to our own server so we can mock
          // responses even if the detector is in a different process. It also speeds up the
          // test because leaving it undefined would try to request to a internal IP which I found
          // the time to fail is variable
          // Ref: https://github.com/googleapis/gcp-metadata/blob/d88841db90d7d390eefb0de02b736b41f6adddde/README.md#environment-variables
          GCE_METADATA_HOST: `127.0.0.1:${port}`,
        },
        checkResult: (err, stdout, stderr) => {
          assert.ifError(err);
        },
        checkCollector(collector) {
          const httpScope = '@opentelemetry/instrumentation-http';
          const spans = collector.sortedSpans;
          const httpSpans = spans.filter(s => s.instrumentationScope.name === httpScope);
          const gcpSpans = httpSpans.filter(s => {
            return s.attributes.some(
              a =>
                a.key === 'http.url' &&
                a.value.stringValue?.includes('/computeMetadata/v1/')
            );
          });

          // SDK collects the 2 spans from the fixture
          assert.strictEqual(httpSpans.length, 2);
          // but no spans related to GCP detector
          assert.strictEqual(gcpSpans.length, 0);
        },
      });

      gcpServer.close();
    }
  ).timeout(10000);
  });
});
