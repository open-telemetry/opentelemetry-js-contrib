/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanStatusCode } from '@opentelemetry/api';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import * as assert from 'assert';
import { SpanNames } from '../src/constants';

describe('oracledb ESM', () => {
  it('should instrument oracledb loaded with an ESM default import', async () => {
    await testUtils.runTestFixture({
      cwd: __dirname,
      argv: ['fixtures/use-oracledb.mjs'],
      env: {
        NODE_OPTIONS:
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
        NODE_NO_WARNINGS: '1',
      },
      checkResult: (err, stdout, stderr) => {
        assert.ifError(err);
        assert.doesNotMatch(stderr, /Failed to load oracledb module/);
      },
      checkCollector: (collector: testUtils.TestCollector) => {
        const spans = collector.sortedSpans;
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(spans[0].name, SpanNames.CONNECT);
        assert.strictEqual(spans[0].kind, 3); // OTLP SPAN_KIND_CLIENT
        assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
      },
    });
  });
});
