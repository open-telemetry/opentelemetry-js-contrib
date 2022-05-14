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
import { RedisInstrumentation } from '../src';
import * as assert from 'assert';

import {
  redisTestConfig,
  redisTestUrl,
  shouldTest,
  shouldTestLocal,
} from './utils';
import * as testUtils from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(
  new RedisInstrumentation()
);

import { createClient } from 'redis';
import {
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
  context,
} from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { RedisResponseCustomAttributeFunction } from '../src/types';
import { hrTimeToMilliseconds } from '@opentelemetry/core';

describe('redis@^4.0.0', () => {
  before(function () {
    // needs to be "function" to have MochaContext "this" context
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    }

    if (shouldTestLocal) {
      testUtils.startDocker('redis');
    }
  });

  after(() => {
    if (shouldTestLocal) {
      testUtils.cleanUpDocker('redis');
    }
  });

  let client: any;

  beforeEach(async () => {
    client = createClient({
      url: redisTestUrl,
    });
    await client.connect();
  });

  afterEach(async () => {
    await client?.disconnect();
  });

  describe('redis commands', () => {
    it('simple set and get', async () => {
      await client.set('key', 'value');
      const value = await client.get('key');
      assert.strictEqual(value, 'value'); // verify we did not screw up the normal functionality

      const spans = getTestSpans();
      assert.strictEqual(spans.length, 2);

      const setSpan = spans.find(s => s.name.includes('SET'));
      assert.ok(setSpan);
      assert.strictEqual(setSpan?.kind, SpanKind.CLIENT);
      assert.strictEqual(setSpan?.name, 'redis-SET');
      assert.strictEqual(
        setSpan?.attributes[SemanticAttributes.DB_SYSTEM],
        'redis'
      );
      assert.strictEqual(
        setSpan?.attributes[SemanticAttributes.DB_STATEMENT],
        'SET'
      );
      assert.strictEqual(
        setSpan?.attributes[SemanticAttributes.NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        setSpan?.attributes[SemanticAttributes.NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        setSpan?.attributes[SemanticAttributes.DB_CONNECTION_STRING],
        redisTestUrl
      );

      const getSpan = spans.find(s => s.name.includes('GET'));
      assert.ok(getSpan);
      assert.strictEqual(getSpan?.kind, SpanKind.CLIENT);
      assert.strictEqual(getSpan?.name, 'redis-GET');
      assert.strictEqual(
        getSpan?.attributes[SemanticAttributes.DB_SYSTEM],
        'redis'
      );
      assert.strictEqual(
        getSpan?.attributes[SemanticAttributes.DB_STATEMENT],
        'GET'
      );
      assert.strictEqual(
        getSpan?.attributes[SemanticAttributes.NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        getSpan?.attributes[SemanticAttributes.NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        getSpan?.attributes[SemanticAttributes.DB_CONNECTION_STRING],
        redisTestUrl
      );
    });

    it('send general command', async () => {
      const res = await client.sendCommand(['SET', 'key', 'value']);
      assert.strictEqual(res, 'OK'); // verify we did not screw up the normal functionality

      const [setSpan] = getTestSpans();

      assert.ok(setSpan);
      assert.strictEqual(
        setSpan?.attributes[SemanticAttributes.DB_STATEMENT],
        'SET'
      );
      assert.strictEqual(
        setSpan?.attributes[SemanticAttributes.NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        setSpan?.attributes[SemanticAttributes.NET_PEER_PORT],
        redisTestConfig.port
      );
    });

    it('command with error', async () => {
      await client.set('string-key', 'string-value');
      await assert.rejects(async () => await client.incr('string-key'));

      const [_setSpan, incrSpan] = getTestSpans();

      assert.ok(incrSpan);
      assert.strictEqual(incrSpan?.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(
        incrSpan?.status.message,
        'ERR value is not an integer or out of range'
      );

      const exceptions = incrSpan.events.filter(
        event => event.name === 'exception'
      );
      assert.strictEqual(exceptions.length, 1);
      assert.strictEqual(
        exceptions?.[0].attributes?.[SemanticAttributes.EXCEPTION_MESSAGE],
        'ERR value is not an integer or out of range'
      );
    });
  });

  describe('multi (transactions) commands', () => {
    it('multi commands', async () => {
      await client.set('another-key', 'another-value');
      const [setKeyReply, otherKeyValue] = await client
        .multi()
        .set('key', 'value')
        .get('another-key')
        .exec(); // ['OK', 'another-value']

      assert.strictEqual(setKeyReply, 'OK'); // verify we did not screw up the normal functionality
      assert.strictEqual(otherKeyValue, 'another-value'); // verify we did not screw up the normal functionality

      const [setSpan, multiSetSpan, multiGetSpan] = getTestSpans();

      assert.ok(setSpan);

      assert.ok(multiSetSpan);
      assert.strictEqual(multiSetSpan.name, 'redis-SET');
      assert.strictEqual(
        multiSetSpan.attributes[SemanticAttributes.DB_STATEMENT],
        'SET'
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SemanticAttributes.NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SemanticAttributes.NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SemanticAttributes.DB_CONNECTION_STRING],
        redisTestUrl
      );

      assert.ok(multiGetSpan);
      assert.strictEqual(multiGetSpan.name, 'redis-GET');
      assert.strictEqual(
        multiGetSpan.attributes[SemanticAttributes.DB_STATEMENT],
        'GET'
      );
      assert.strictEqual(
        multiGetSpan?.attributes[SemanticAttributes.NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        multiGetSpan?.attributes[SemanticAttributes.NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        multiGetSpan?.attributes[SemanticAttributes.DB_CONNECTION_STRING],
        redisTestUrl
      );
    });

    it('multi command with generic command', async () => {
      const [setReply] = await client
        .multi()
        .addCommand(['SET', 'key', 'value'])
        .exec();
      assert.strictEqual(setReply, 'OK'); // verify we did not screw up the normal functionality

      const [multiSetSpan] = getTestSpans();
      assert.ok(multiSetSpan);
      assert.strictEqual(
        multiSetSpan.attributes[SemanticAttributes.DB_STATEMENT],
        'SET'
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SemanticAttributes.NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SemanticAttributes.NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SemanticAttributes.DB_CONNECTION_STRING],
        redisTestUrl
      );
    });

    it('multi command with error', async () => {
      const [setReply, incrReply] = await client
        .multi()
        .set('key', 'value')
        .incr('key')
        .exec(); // ['OK', 'ReplyError']
      assert.strictEqual(setReply, 'OK'); // verify we did not screw up the normal functionality
      assert.ok(incrReply instanceof Error); // verify we did not screw up the normal functionality

      const [multiSetSpan, multiIncrSpan] = getTestSpans();

      assert.ok(multiSetSpan);
      assert.strictEqual(multiSetSpan.status.code, SpanStatusCode.UNSET);

      assert.ok(multiIncrSpan);
      assert.strictEqual(multiIncrSpan.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(
        multiIncrSpan.status.message,
        'ERR value is not an integer or out of range'
      );
    });

    it('duration covers create until server response', async () => {
      await client.set('another-key', 'another-value');
      const multiClient = client.multi();
      let commands = multiClient.set('key', 'value');
      // wait 10 ms before adding next command
      // simulate long operation
      await new Promise(resolve => setTimeout(resolve, 10));
      commands = commands.get('another-key');
      const [setKeyReply, otherKeyValue] = await commands.exec(); // ['OK', 'another-value']

      assert.strictEqual(setKeyReply, 'OK'); // verify we did not screw up the normal functionality
      assert.strictEqual(otherKeyValue, 'another-value'); // verify we did not screw up the normal functionality

      const [_setSpan, multiSetSpan, multiGetSpan] = getTestSpans();
      // verify that commands span started when it was added to multi and not when "sent".
      // they were called with 10 ms gap between them, so it should be reflected in the span start time
      // could be nice feature in the future to capture an event for when it is actually sent
      const startTimeDiff =
        hrTimeToMilliseconds(multiGetSpan.startTime) -
        hrTimeToMilliseconds(multiSetSpan.startTime);
      assert.ok(
        startTimeDiff >= 9,
        `diff of start time should be >= 10 and it's ${startTimeDiff}`
      );

      const endTimeDiff =
        hrTimeToMilliseconds(multiGetSpan.endTime) -
        hrTimeToMilliseconds(multiSetSpan.endTime);
      assert.ok(endTimeDiff < 10); // spans should all end together when multi response arrives from redis server
    });

    it('response hook for multi commands', async () => {
      const responseHook: RedisResponseCustomAttributeFunction = (
        span: Span,
        cmdName: string,
        cmdArgs: Array<string | Buffer>,
        response: unknown
      ) => {
        span.setAttribute('test.cmd.name', cmdName);
        span.setAttribute('test.cmd.args', cmdArgs as string[]);
        span.setAttribute('test.db.response', response as string);
      };
      instrumentation.setConfig({ responseHook });

      await client.set('another-key', 'another-value');
      const [setKeyReply, otherKeyValue] = await client
        .multi()
        .set('key', 'value')
        .get('another-key')
        .exec(); // ['OK', 'another-value']
      assert.strictEqual(setKeyReply, 'OK'); // verify we did not screw up the normal functionality
      assert.strictEqual(otherKeyValue, 'another-value'); // verify we did not screw up the normal functionality

      const [_setSpan, multiSetSpan, multiGetSpan] = getTestSpans();

      assert.ok(multiSetSpan);
      assert.strictEqual(multiSetSpan.attributes['test.cmd.name'], 'SET');
      assert.deepStrictEqual(multiSetSpan.attributes['test.cmd.args'], [
        'key',
        'value',
      ]);
      assert.strictEqual(multiSetSpan.attributes['test.db.response'], 'OK');

      assert.ok(multiGetSpan);
      assert.strictEqual(multiGetSpan.attributes['test.cmd.name'], 'GET');
      assert.deepStrictEqual(multiGetSpan.attributes['test.cmd.args'], [
        'another-key',
      ]);
      assert.strictEqual(
        multiGetSpan.attributes['test.db.response'],
        'another-value'
      );
    });
  });

  describe('config', () => {
    describe('dbStatementSerializer', () => {
      it('custom dbStatementSerializer', async () => {
        const dbStatementSerializer = (
          cmdName: string,
          cmdArgs: Array<string | Buffer>
        ) => {
          return `${cmdName} ${cmdArgs.join(' ')}`;
        };

        instrumentation.setConfig({ dbStatementSerializer });
        await client.set('key', 'value');
        const [span] = getTestSpans();
        assert.strictEqual(
          span.attributes[SemanticAttributes.DB_STATEMENT],
          'SET key value'
        );
      });

      it('dbStatementSerializer throws', async () => {
        const dbStatementSerializer = () => {
          throw new Error('dbStatementSerializer error');
        };

        instrumentation.setConfig({ dbStatementSerializer });
        await client.set('key', 'value');
        const [span] = getTestSpans();
        assert.ok(span);
        assert.ok(!(SemanticAttributes.DB_STATEMENT in span.attributes));
      });
    });

    describe('responseHook', () => {
      it('valid response hook', async () => {
        const responseHook: RedisResponseCustomAttributeFunction = (
          span: Span,
          cmdName: string,
          cmdArgs: Array<string | Buffer>,
          response: unknown
        ) => {
          span.setAttribute('test.cmd.name', cmdName);
          span.setAttribute('test.cmd.args', cmdArgs as string[]);
          span.setAttribute('test.db.response', response as string);
        };
        instrumentation.setConfig({ responseHook });
        await client.set('key', 'value');
        const [span] = getTestSpans();
        assert.ok(span);
        assert.strictEqual(span.attributes['test.cmd.name'], 'SET');
        assert.deepStrictEqual(span.attributes['test.cmd.args'], [
          'key',
          'value',
        ]);
        assert.strictEqual(span.attributes['test.db.response'], 'OK');
      });

      it('responseHook throws', async () => {
        const responseHook = () => {
          throw new Error('responseHook error');
        };
        instrumentation.setConfig({ responseHook });
        const res = await client.set('key', 'value');
        assert.strictEqual(res, 'OK'); // package is still functional
        const [span] = getTestSpans();
        assert.ok(span);
      });
    });

    describe('requireParentSpan', () => {
      it('set to true', async () => {
        instrumentation.setConfig({ requireParentSpan: true });

        // no parent span => no redis span
        const res = await client.set('key', 'value');
        assert.strictEqual(res, 'OK'); // verify we did not screw up the normal functionality
        assert.ok(getTestSpans().length === 0);

        // has ambient span => redis span
        const span = trace.getTracer('test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          const res = await client.set('key', 'value');
          assert.strictEqual(res, 'OK'); // verify we did not screw up the normal functionality
          assert.ok(getTestSpans().length === 1);
        });
        span.end();
      });
    });
  });
});
