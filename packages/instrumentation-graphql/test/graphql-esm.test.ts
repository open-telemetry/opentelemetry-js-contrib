/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  runTestFixture,
  TestCollector,
} from '@opentelemetry/contrib-test-utils';
import * as assert from 'assert';

describe('graphql ESM usage', () => {
  it('should instrument graphql loaded as an ES module', async () => {
    await runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/use-graphql.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        NODE_NO_WARNINGS: '1',
      },
      checkResult: (err: Error | null) => {
        assert.ifError(err);
      },
      checkCollector: (collector: TestCollector) => {
        const spanNames = collector.sortedSpans.map(s => s.name);
        assert.ok(
          spanNames.includes('graphql.parse'),
          `missing parse span, got ${spanNames}`
        );
        assert.ok(
          spanNames.includes('graphql.validate'),
          `missing validate span, got ${spanNames}`
        );
        assert.ok(
          spanNames.includes('graphql.resolve hello'),
          `missing resolve span, got ${spanNames}`
        );
        assert.ok(
          spanNames.includes('query'),
          `missing execute span, got ${spanNames}`
        );
      },
    });
  });
});
