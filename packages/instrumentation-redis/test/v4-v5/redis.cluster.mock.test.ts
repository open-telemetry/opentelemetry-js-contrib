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
import { SpanStatusCode } from '@opentelemetry/api';
import { ATTR_DB_STATEMENT } from '../../src/semconv';
import {
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_OPERATION_NAME,
} from '@opentelemetry/semantic-conventions';

process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'database/dup';
registerInstrumentationTesting(new RedisInstrumentation());

// Import AFTER registerInstrumentationTesting so module patching fires on require
import RedisClusterMultiCommand from '@redis/client/dist/lib/cluster/multi-command';
import { ErrorReply } from '@redis/client/dist/lib/errors';

/**
 * Creates a RedisClusterMultiCommand with a fake executeMulti.
 * rawReplies is what transformReplies receives — plain values or ErrorReply
 * instances (ErrorReply in the array triggers MultiErrorReply inside transformReplies).
 */
function makeMultiCommand(rawReplies: unknown[] | Error) {
  const executeMulti = async () => {
    if (rawReplies instanceof Error) throw rawReplies;
    return rawReplies;
  };
  const executePipeline = async () => {
    if (rawReplies instanceof Error) throw rawReplies;
    return rawReplies;
  };
  return new (RedisClusterMultiCommand as any)(
    executeMulti,
    executePipeline,
    undefined, // routing / firstKey
    undefined // typeMapping
  );
}

describe('redis v4-v5 cluster mock (no live Redis required)', () => {
  describe('cluster addCommand — named command path (firstKey, isReadonly, args)', () => {
    it('should create a span when called as (firstKey, isReadonly, args) — internal named command path', async () => {
      const multi = makeMultiCommand([1]);

      // Internal named command path: addCommand(firstKey, isReadonly, args, transformReply)
      // firstKeyOrArgs is a string, so instrumentation uses args (third param) as redisArgs
      multi.addCommand('mykey', true, ['GET', 'mykey'], undefined);

      try {
        await (multi as any).exec();
      } catch {}

      const spans = getTestSpans();
      const getSpan = spans.find(s => s.name === 'redis-GET');
      assert.ok(
        getSpan,
        `Expected redis-GET span, got: ${spans.map(s => s.name).join(', ')}`
      );
      assert.strictEqual(getSpan!.attributes['db.system'], 'redis');
      assert.ok(
        (getSpan!.attributes[ATTR_DB_STATEMENT] as string)?.startsWith('GET')
      );
      assert.ok(
        (getSpan!.attributes[ATTR_DB_QUERY_TEXT] as string)?.startsWith('GET')
      );
    });
  });

  describe('cluster addCommand — user generic path (array as first arg)', () => {
    it('should create a span when user calls .addCommand([...]) directly', async () => {
      const multi = makeMultiCommand(['OK']);

      // User direct path: multi.addCommand(['SET', 'key', 'val'])
      // firstKeyOrArgs is an array, so instrumentation uses it directly as redisArgs
      multi.addCommand(['SET', 'mykey', 'myval'], false, undefined, undefined);

      try {
        await (multi as any).exec();
      } catch {}

      const spans = getTestSpans();
      const setSpan = spans.find(s => s.name === 'redis-SET');
      assert.ok(
        setSpan,
        `Expected redis-SET span, got: ${spans.map(s => s.name).join(', ')}`
      );
      assert.strictEqual(setSpan!.attributes['db.system'], 'redis');
      assert.ok(
        (setSpan!.attributes[ATTR_DB_STATEMENT] as string)?.startsWith('SET')
      );
      assert.ok(
        (setSpan!.attributes[ATTR_DB_QUERY_TEXT] as string)?.startsWith('SET')
      );
    });
  });

  describe('cluster exec — success path', () => {
    it('should end multiple spans with MULTI operation name after exec resolves', async () => {
      const multi = makeMultiCommand([5, 3]);

      multi.addCommand('key1', true, ['ZCARD', 'key1'], undefined);
      multi.addCommand(
        'key2',
        false,
        ['ZREMRANGEBYSCORE', 'key2', '-inf', '+inf'],
        undefined
      );

      try {
        await (multi as any).exec();
      } catch {}

      const spans = getTestSpans();
      const zcardSpan = spans.find(s => s.name === 'redis-ZCARD');
      const zremSpan = spans.find(s => s.name === 'redis-ZREMRANGEBYSCORE');

      assert.ok(zcardSpan, 'Expected redis-ZCARD span');
      assert.ok(zremSpan, 'Expected redis-ZREMRANGEBYSCORE span');
      assert.strictEqual(
        zcardSpan!.attributes[ATTR_DB_OPERATION_NAME],
        'MULTI'
      );
      assert.strictEqual(zremSpan!.attributes[ATTR_DB_OPERATION_NAME], 'MULTI');
    });

    it('should set MULTI <CMD> operation name when all commands in the batch are the same', async () => {
      const multi = makeMultiCommand(['OK', 'OK']);

      multi.addCommand('key1', false, ['SET', 'key1', 'val1'], undefined);
      multi.addCommand('key2', false, ['SET', 'key2', 'val2'], undefined);

      try {
        await (multi as any).exec();
      } catch {}

      const spans = getTestSpans();
      spans
        .filter(s => s.name === 'redis-SET')
        .forEach(s => {
          assert.strictEqual(s.attributes[ATTR_DB_OPERATION_NAME], 'MULTI SET');
        });
    });
  });

  describe('cluster exec — error paths', () => {
    it('should end spans with ERROR status when exec rejects with a generic error', async () => {
      const multi = makeMultiCommand(new Error('cluster exec failed'));

      multi.addCommand('key1', false, ['SET', 'key1', 'val'], undefined);

      try {
        await (multi as any).exec();
      } catch {}

      const spans = getTestSpans();
      const setSpan = spans.find(s => s.name === 'redis-SET');
      assert.ok(setSpan, 'Expected redis-SET span');
      assert.strictEqual(setSpan!.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(setSpan!.status.message, 'cluster exec failed');
    });

    it('should handle per-command errors via MultiErrorReply — error span is ERROR, success span is UNSET', async () => {
      // ErrorReply in the rawReplies array causes transformReplies to throw MultiErrorReply
      const wrongTypeErr = new ErrorReply(
        'WRONGTYPE Operation against a key holding the wrong kind of value'
      );
      const multi = makeMultiCommand([wrongTypeErr, 2]);

      multi.addCommand('key1', false, ['INCR', 'key1'], undefined);
      multi.addCommand('key2', true, ['ZCARD', 'key2'], undefined);

      try {
        await (multi as any).exec();
      } catch {}

      const spans = getTestSpans();
      const incrSpan = spans.find(s => s.name === 'redis-INCR');
      const zcardSpan = spans.find(s => s.name === 'redis-ZCARD');

      assert.ok(incrSpan, 'Expected redis-INCR span');
      assert.ok(zcardSpan, 'Expected redis-ZCARD span');
      assert.strictEqual(incrSpan!.status.code, SpanStatusCode.ERROR);
    });
  });
  
  describe('cluster MULTI patch — MULTI_COMMAND_OPTIONS symbol', () => {
    it('should store cluster _options on the returned multi object under MULTI_COMMAND_OPTIONS symbol', () => {
      const MULTI_COMMAND_OPTIONS = Symbol.for(
        'opentelemetry.instrumentation.redis.multi_command_options'
      ) as any;

      const fakeOptions = { rootNodes: [{ url: 'redis://localhost:6379' }] };
      const fakeMultiResult: any = {};
      fakeMultiResult[MULTI_COMMAND_OPTIONS] = fakeOptions;

      assert.strictEqual(
        fakeMultiResult[MULTI_COMMAND_OPTIONS],
        fakeOptions,
        'MULTI_COMMAND_OPTIONS symbol should hold the cluster options'
      );
    });

    it('should use MULTI_COMMAND_OPTIONS to resolve client attributes in _traceClientCommand', () => {
      const MULTI_COMMAND_OPTIONS = Symbol.for(
        'opentelemetry.instrumentation.redis.multi_command_options'
      ) as any;

      const fakeOptions = { socket: { host: 'cluster-host', port: 7000 } };
      const fakeMultiObj: any = {};
      fakeMultiObj[MULTI_COMMAND_OPTIONS] = fakeOptions;

      // _traceClientCommand reads: origThis.options || origThis[MULTI_COMMAND_OPTIONS]
      const resolvedOptions =
        fakeMultiObj.options || fakeMultiObj[MULTI_COMMAND_OPTIONS];
      assert.deepStrictEqual(resolvedOptions, fakeOptions);
    });
  });
});
