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

import {
  runTestFixture,
  TestCollector,
} from '@opentelemetry/contrib-test-utils';
import * as assert from 'assert';

describe('[Integration] GcpDetector', async () => {
  it('should not start spans for detector requests', async () => {
    await runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/detect-with-http-instrumentation.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        METADATA_SERVER_DETECTION: 'assume-present',
      },
      checkResult: (err, stdout, stderr) => {
        assert.ifError(err);
      },
      checkCollector: (collector: TestCollector) => {
        assert.equal(
          collector.spans.length,
          0,
          'no spans exported for GcpDetector'
        );
      },
    });
  }).timeout(15000);
});
