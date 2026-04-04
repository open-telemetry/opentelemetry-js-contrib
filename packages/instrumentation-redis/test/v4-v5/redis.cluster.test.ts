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
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
import { RedisInstrumentation } from '../../src/index';
import * as assert from 'assert';
import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { SpanStatusCode } from '@opentelemetry/api';
import { ATTR_DB_STATEMENT } from '../../src/semconv';
import {
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_OPERATION_NAME,
} from '@opentelemetry/semantic-conventions';
process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'database/dup';
registerInstrumentationTesting(new RedisInstrumentation());
import { createCluster } from 'redis';
import type { RedisClusterType } from 'redis';
const shouldTest = process.env.RUN_REDIS_CLUSTER_TESTS;
const clusterRootNodes = [
  {
    url: `redis://${process.env.OPENTELEMETRY_REDIS_CLUSTER_HOST || 'localhost'}:${process.env.OPENTELEMETRY_REDIS_CLUSTER_PORT || 6379}`,
  },
];
describe('redis v4-v5 cluster', () => {
  before(function () {
    if (!shouldTest) {
      this.test!.parent!.pending = true;
      this.skip();
    }
  });
  let client: RedisClusterType;
  beforeEach(async () => {
    client = createCluster({ rootNodes: clusterRootNodes });
    await context.with(suppressTracing(context.active()), async () => {
      await client.connect();
    });
  });
  afterEach(async () => {
    await client?.disconnect();
  });
  describe('cluster multi (transaction) commands', () => {
    it('should produce spans for commands run inside multi().exec() on a cluster', async () => {
      const key = 'test-cluster-multi-key';
      const [zremResult, zcardResult] = await client
        .multi()
        .ZREMRANGEBYSCORE(key, '-inf', Date.now())
        .ZCARD(key)
        .execTyped();
      assert.strictEqual(typeof zremResult, 'number');
      assert.strictEqual(typeof zcardResult, 'number');
      const spans = getTestSpans();
      const spanNames = spans.map(s => s.name);
      const zremSpan = spans.find(s => s.name === 'redis-ZREMRANGEBYSCORE');
      const zcardSpan = spans.find(s => s.name === 'redis-ZCARD');
      assert.ok(
        zremSpan,
        `Expected redis-ZREMRANGEBYSCORE span, got: ${spanNames.join(', ')}`
      );
      assert.ok(
        zcardSpan,
        `Expected redis-ZCARD span, got: ${spanNames.join(', ')}`
      );
      assert.strictEqual(zremSpan.attributes['db.system'], 'redis');
      assert.ok(
        (zremSpan.attributes[ATTR_DB_STATEMENT] as string)?.startsWith(
          'ZREMRANGEBYSCORE'
        )
      );
      assert.ok(
        (zremSpan.attributes[ATTR_DB_QUERY_TEXT] as string)?.startsWith(
          'ZREMRANGEBYSCORE'
        )
      );
      assert.strictEqual(zremSpan.attributes[ATTR_DB_OPERATION_NAME], 'MULTI');
      assert.strictEqual(zcardSpan.attributes['db.system'], 'redis');
      assert.ok(
        (zcardSpan.attributes[ATTR_DB_STATEMENT] as string)?.startsWith('ZCARD')
      );
      assert.ok(
        (zcardSpan.attributes[ATTR_DB_QUERY_TEXT] as string)?.startsWith(
          'ZCARD'
        )
      );
      assert.strictEqual(zcardSpan.attributes[ATTR_DB_OPERATION_NAME], 'MULTI');
    });
    it('should produce spans for commands run inside multi().exec() with generic addCommand on a cluster', async () => {
      const key = 'test-cluster-addcommand-key';
      const [setReply] = await client
        .multi()
        .addCommand(key, false, ['SET', key, 'value'])
        .exec();
      assert.strictEqual(setReply, 'OK');
      const spans = getTestSpans();
      const setSpan = spans.find(s => s.name === 'redis-SET');
      assert.ok(setSpan, 'Expected redis-SET span');
      assert.strictEqual(setSpan.attributes['db.system'], 'redis');
      assert.ok(
        (setSpan.attributes[ATTR_DB_STATEMENT] as string)?.startsWith('SET')
      );
    });
    it('should handle errors in cluster multi commands', async () => {
      const key = 'test-cluster-error-key';
      await client.set(key, 'string-value');

      try {
        await client.multi().set(key, 'value').incr(key).exec();
      } catch (err: any) {}
      const spans = getTestSpans();
      const incrSpan = spans.find(s => s.name === 'redis-INCR');
      assert.ok(incrSpan, 'Expected redis-INCR span');
      assert.strictEqual(incrSpan.status.code, SpanStatusCode.ERROR);
    });
  });
  describe('cluster regular commands', () => {
    it('should produce spans for regular cluster commands', async () => {
      const key = 'test-cluster-regular-key';
      await client.set(key, 'value');
      const value = await client.get(key);
      assert.strictEqual(value, 'value');
      const spans = getTestSpans();
      const setSpan = spans.find(s => s.name === 'redis-SET');
      const getSpan = spans.find(s => s.name === 'redis-GET');
      assert.ok(setSpan, 'Expected redis-SET span');
      assert.ok(getSpan, 'Expected redis-GET span');
      assert.strictEqual(setSpan.attributes['db.system'], 'redis');
      assert.strictEqual(getSpan.attributes['db.system'], 'redis');
    });
  });
});
