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

import * as assert from 'assert';

import * as http from 'http';

import {
  runTestFixture,
} from '@opentelemetry/contrib-test-utils';

const HEADERS = {
  'metadata-flavor': 'Google',
};
const BASE_PATH = '/computeMetadata/v1';
const INSTANCE_PATH = BASE_PATH + '/instance';
const INSTANCE_ID_PATH = BASE_PATH + '/instance/id';
const PROJECT_ID_PATH = BASE_PATH + '/project/project-id';
const ZONE_PATH = BASE_PATH + '/instance/zone';
const CLUSTER_NAME_PATH = BASE_PATH + '/instance/attributes/cluster-name';
const HOSTNAME_PATH = BASE_PATH + '/instance/hostname';

describe.only('gcpDetector - internal tracing', () => {
  it('should not export traces related to GCP detection', async () => {
      const logs: any[] = [];
      const gcpServer = http.createServer((req,res) => {
        logs.push([Date.now(), 'XXX: req to', req.url])
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
          logs.push([Date.now(), 'XXX: response body', body])
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
          // This env var makes `gpc-metadata` return true when `isAvailable` API is called.
          // Setting it makes sure the detector does HTTP calls to medatada endpoints
          // so we can assert that no spans are created for these requests.
          // Ref: https://github.com/googleapis/gcp-metadata/blob/d88841db90d7d390eefb0de02b736b41f6adddde/src/index.ts#L351
          // METADATA_SERVER_DETECTION: 'none',
          GCE_METADATA_HOST: `127.0.0.1:${port}`,
        },
        checkResult: (err, stdout, stderr) => {
          console.log(stdout);
          const temp = stdout.split('\n').filter(l => /^\d+/.test(l)).map(l => {
            const [num, rest] = l.split(',');
            return [parseInt(num.trim(), 10), rest];
          });
          logs.push(...temp);
          assert.ifError(err);
        },
        checkCollector(collector) {
          const spans = collector.sortedSpans;
          const httpSpans = spans.filter(
            s =>
              s.instrumentationScope.name ===
              '@opentelemetry/instrumentation-http'
          );
          const gcpSpans = httpSpans.filter(s => {
            return s.attributes.some(
              a =>
                a.key === 'http.url' &&
                a.value.stringValue?.includes('/computeMetadata/v1/')
            );
          });

          // console.dir(httpSpans, {depth:5})
          console.log(logs.sort((a, b) => {
            const aTime = a[0];
            const bTime = b[0];
            return aTime - bTime;
          }));
          assert.ok(httpSpans.length > 0);
          assert.strictEqual(gcpSpans.length, 0);
        },
      });

      gcpServer.close();
    }
  ).timeout(10000);
});
