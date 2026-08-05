/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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
