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

import { diag, DiagLogLevel, ROOT_CONTEXT } from '@opentelemetry/api';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
import { RedisInstrumentation } from '../../src';
import type { MultiErrorReply } from '../../src/v4-v5/internal-types';
import * as assert from 'assert';

import { redisTestConfig, redisTestUrl, shouldTest } from './utils';

process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'database/dup';
const instrumentation = registerInstrumentationTesting(
  new RedisInstrumentation()
);

import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import {
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
  context,
} from '@opentelemetry/api';
import {
  SEMATTRS_DB_CONNECTION_STRING,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_EXCEPTION_MESSAGE,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  ATTR_EXCEPTION_MESSAGE,
} from '@opentelemetry/semantic-conventions';
import { RedisResponseCustomAttributeFunction } from '../../src/types';
import { hrTimeToMilliseconds, suppressTracing } from '@opentelemetry/core';
import { SemconvStability } from '@opentelemetry/instrumentation';

describe('redis v4-v5', () => {
  before(function () {
    // needs to be "function" to have MochaContext "this" context
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    }
  });

  let client: RedisClientType;

  beforeEach(async () => {
    client = createClient({
      url: redisTestUrl,
    });
    await context.with(suppressTracing(context.active()), async () => {
      await client.connect();
    });
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
      assert.strictEqual(setSpan?.attributes[ATTR_DB_SYSTEM_NAME], 'redis');
      assert.strictEqual(setSpan?.attributes[SEMATTRS_DB_SYSTEM], 'redis');
      assert.strictEqual(
        setSpan?.attributes[SEMATTRS_DB_STATEMENT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        setSpan?.attributes[ATTR_DB_QUERY_TEXT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        setSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        setSpan?.attributes[ATTR_SERVER_ADDRESS],
        redisTestConfig.host
      );
      assert.strictEqual(
        setSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        setSpan?.attributes[ATTR_SERVER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(setSpan?.attributes[ATTR_DB_OPERATION_NAME], 'SET');
      assert.strictEqual(
        setSpan?.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisTestUrl
      );

      const getSpan = spans.find(s => s.name.includes('GET'));
      assert.ok(getSpan);
      assert.strictEqual(getSpan?.kind, SpanKind.CLIENT);
      assert.strictEqual(getSpan?.name, 'redis-GET');
      assert.strictEqual(getSpan?.attributes[ATTR_DB_SYSTEM_NAME], 'redis');
      assert.strictEqual(getSpan?.attributes[ATTR_DB_QUERY_TEXT], 'GET key');
      assert.strictEqual(getSpan?.attributes[SEMATTRS_DB_SYSTEM], 'redis');
      assert.strictEqual(getSpan?.attributes[SEMATTRS_DB_STATEMENT], 'GET key');
      assert.strictEqual(
        getSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        getSpan?.attributes[ATTR_SERVER_ADDRESS],
        redisTestConfig.host
      );
      assert.strictEqual(
        getSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        getSpan?.attributes[ATTR_SERVER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        getSpan?.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisTestUrl
      );
    });

    it('send general command', async () => {
      const res = await client.sendCommand(['SET', 'key', 'value']);
      assert.strictEqual(res, 'OK'); // verify we did not screw up the normal functionality

      const [setSpan] = getTestSpans();

      assert.ok(setSpan);
      assert.strictEqual(
        setSpan?.attributes[SEMATTRS_DB_STATEMENT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        setSpan?.attributes[ATTR_DB_QUERY_TEXT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        setSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        setSpan?.attributes[ATTR_SERVER_ADDRESS],
        redisTestConfig.host
      );
      assert.strictEqual(
        setSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        setSpan?.attributes[ATTR_SERVER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(setSpan?.attributes[ATTR_DB_OPERATION_NAME], 'SET');
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
        exceptions?.[0].attributes?.[SEMATTRS_EXCEPTION_MESSAGE],
        'ERR value is not an integer or out of range'
      );
      assert.strictEqual(
        exceptions?.[0].attributes?.[ATTR_EXCEPTION_MESSAGE],
        'ERR value is not an integer or out of range'
      );
    });
  });

  describe('client connect', () => {
    it('produces a span', async () => {
      const newClient = createClient({
        url: redisTestUrl,
      });

      after(async () => {
        await newClient.disconnect();
      });

      await newClient.connect();

      const [span] = getTestSpans();

      assert.strictEqual(span.name, 'redis-connect');

      assert.strictEqual(span.attributes[SEMATTRS_DB_SYSTEM], 'redis');
      assert.strictEqual(span.attributes[ATTR_DB_SYSTEM_NAME], 'redis');
      assert.strictEqual(
        span.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        span.attributes[ATTR_SERVER_ADDRESS],
        redisTestConfig.host
      );
      assert.strictEqual(
        span.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        span.attributes[ATTR_SERVER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        span.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisTestUrl
      );
    });

    it('sets error status on connection failure', async () => {
      const redisURL = `redis://${redisTestConfig.host}:${
        redisTestConfig.port + 1
      }`;
      const newClient = createClient({
        url: redisURL,
      });

      await assert.rejects(newClient.connect());

      const [span] = getTestSpans();

      assert.strictEqual(span.name, 'redis-connect');
      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(
        span.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisURL
      );
    });

    it('omits basic auth from DB_CONNECTION_STRING span attribute', async () => {
      const redisURL = `redis://myuser:mypassword@${redisTestConfig.host}:${
        redisTestConfig.port + 1
      }`;
      const expectAttributeConnString = `redis://${redisTestConfig.host}:${
        redisTestConfig.port + 1
      }`;
      const newClient = createClient({
        url: redisURL,
      });

      await assert.rejects(newClient.connect());

      const [span] = getTestSpans();

      assert.strictEqual(span.name, 'redis-connect');
      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(
        span.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        span.attributes[SEMATTRS_DB_CONNECTION_STRING],
        expectAttributeConnString
      );
    });

    it('omits user_pwd query parameter from DB_CONNECTION_STRING span attribute', async () => {
      const redisURL = `redis://${redisTestConfig.host}:${
        redisTestConfig.port + 1
      }?db=mydb&user_pwd=mypassword`;
      const expectAttributeConnString = `redis://${redisTestConfig.host}:${
        redisTestConfig.port + 1
      }?db=mydb`;
      const newClient = createClient({
        url: redisURL,
      });

      await assert.rejects(newClient.connect());

      const [span] = getTestSpans();

      assert.strictEqual(span.name, 'redis-connect');
      assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(
        span.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        span.attributes[SEMATTRS_DB_CONNECTION_STRING],
        expectAttributeConnString
      );
    });

    it('with empty string for client URL, there is no crash and no diag.error', async () => {
      // Note: This messily leaves the diag logger set for other tests.
      const diagErrors = [] as any;
      diag.setLogger(
        {
          verbose() {},
          debug() {},
          info() {},
          warn() {},
          error(...args) {
            diagErrors.push(args);
          },
        },
        DiagLogLevel.WARN
      );

      const newClient = createClient({ url: '' });
      try {
        await newClient.connect();
      } catch (_err) {
        // Ignore. If the test Redis is not at the default port we expect this
        // to error.
      }
      try {
        await newClient.disconnect();
      } catch (_disconnectErr) {
        // Ignore. In redis@4.4.0 and earlier this disconnect throws
        // "The client is closed" if the connect failed.
      }

      const [span] = getTestSpans();
      assert.strictEqual(span.name, 'redis-connect');
      assert.strictEqual(diagErrors.length, 0, "no diag.error's");
    });
  });

  describe('Redis client connect with malformed URL', () => {
    it('malformed URL should trigger diag error and reject connection', async () => {
      instrumentation.setConfig({ semconvStability: SemconvStability.OLD });

      const diagErrors: any[] = [];
      diag.setLogger(
        {
          verbose() {},
          debug() {},
          info() {},
          warn() {},
          error(...args) {
            diagErrors.push(args);
          },
        },
        DiagLogLevel.ALL
      );

      const client = createClient({
        socket: { host: 'localhost', port: 9999 },
      });

      const opts = (client as any).options;
      if (opts) opts.url = '://malformed-url-no-protocol';

      await assert.rejects(() => client.connect());

      try {
        await client.disconnect();
      } catch {}

      assert.ok(diagErrors.length > 0, 'Expected at least one diag error');
      const found = diagErrors.some(args =>
        args.includes('failed to sanitize redis connection url')
      );

      assert.ok(found, 'Expected sanitize URL diag error');
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
        multiSetSpan.attributes[SEMATTRS_DB_STATEMENT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        multiSetSpan.attributes[ATTR_DB_QUERY_TEXT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        multiSetSpan?.attributes[ATTR_SERVER_ADDRESS],
        redisTestConfig.host
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        multiSetSpan?.attributes[ATTR_SERVER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisTestUrl
      );
      assert.strictEqual(
        multiSetSpan?.attributes[ATTR_DB_OPERATION_NAME],
        'SET'
      );

      assert.ok(multiGetSpan);
      assert.strictEqual(multiGetSpan.name, 'redis-GET');
      assert.strictEqual(
        multiGetSpan.attributes[SEMATTRS_DB_STATEMENT],
        'GET another-key'
      );
      assert.strictEqual(
        multiGetSpan.attributes[ATTR_DB_QUERY_TEXT],
        'GET another-key'
      );
      assert.strictEqual(
        multiGetSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        multiGetSpan?.attributes[ATTR_SERVER_ADDRESS],
        redisTestConfig.host
      );
      assert.strictEqual(
        multiGetSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        multiGetSpan?.attributes[ATTR_SERVER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        multiGetSpan?.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisTestUrl
      );
      assert.strictEqual(
        multiGetSpan?.attributes[ATTR_DB_OPERATION_NAME],
        'GET'
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
        multiSetSpan.attributes[SEMATTRS_DB_STATEMENT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        multiSetSpan.attributes[ATTR_DB_QUERY_TEXT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      assert.strictEqual(
        multiSetSpan?.attributes[ATTR_SERVER_ADDRESS],
        redisTestConfig.host
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        multiSetSpan?.attributes[ATTR_SERVER_PORT],
        redisTestConfig.port
      );
      assert.strictEqual(
        multiSetSpan?.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisTestUrl
      );
      assert.strictEqual(
        multiSetSpan?.attributes[ATTR_DB_OPERATION_NAME],
        'SET'
      );
    });

    it('multi command with error', async () => {
      let replies;
      try {
        replies = await client.multi().set('key', 'value').incr('key').exec();
      } catch (err) {
        // Starting in redis@4.6.12 `multi().exec()` will *throw* a
        // MultiErrorReply, with `err.replies`, if any of the commands error.
        replies = (err as MultiErrorReply).replies;
      }
      const [setReply, incrReply] = replies;

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

    it('multi command that rejects', async () => {
      const watchedKey = 'watched-key';
      await client.watch(watchedKey);
      await client.set(watchedKey, 'a different value');
      try {
        await client.multi().get(watchedKey).exec();
        assert.fail('expected WatchError to be thrown and caught in try/catch');
      } catch (error) {
        assert.ok(error instanceof Error);
      }

      // All the multi spans' status are set to ERROR.
      const [_watchSpan, _setSpan, multiGetSpan] = getTestSpans();
      assert.strictEqual(multiGetSpan?.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(
        multiGetSpan?.status.message,
        'One (or more) of the watched keys has been changed'
      );
    });

    it('duration covers create until server response', async () => {
      await client.set('another-key', 'another-value');
      const multiClient = client.multi();
      let commands: any = multiClient.set('key', 'value');
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
          span.attributes[SEMATTRS_DB_STATEMENT],
          'SET key value'
        );
        assert.strictEqual(
          span.attributes[ATTR_DB_QUERY_TEXT],
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
        assert.ok(!(SEMATTRS_DB_STATEMENT in span.attributes));
        assert.ok(!(ATTR_DB_QUERY_TEXT in span.attributes));
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
        context.with(ROOT_CONTEXT, async () => {
          const res = await client.set('key', 'value');
          assert.strictEqual(res, 'OK'); // verify we did not screw up the normal functionality
          assert.ok(getTestSpans().length === 0);
        });

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

  describe('semconv stability configuration', () => {
    async function getSpan(client: RedisClientType) {
      await client.set('key', 'value');
      const spans = getTestSpans();
      return spans.find(s => s.name.includes('SET'));
    }

    it('should emit only old attributes when semconvStability is OLD', async () => {
      instrumentation.setConfig({ semconvStability: SemconvStability.OLD });
      const setSpan = await getSpan(client);
      assert.ok(setSpan);

      assert.strictEqual(setSpan.attributes[SEMATTRS_DB_SYSTEM], 'redis');
      assert.strictEqual(
        setSpan.attributes[SEMATTRS_DB_STATEMENT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        setSpan.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );

      assert.ok(!(ATTR_DB_SYSTEM_NAME in setSpan.attributes));
      assert.ok(!(ATTR_DB_QUERY_TEXT in setSpan.attributes));
      assert.ok(!(ATTR_SERVER_ADDRESS in setSpan.attributes));
    });

    it('should emit only new attributes when semconvStability is STABLE', async () => {
      instrumentation.setConfig({ semconvStability: SemconvStability.STABLE });
      const setSpan = await getSpan(client);
      assert.ok(setSpan);

      assert.strictEqual(setSpan.attributes[ATTR_DB_SYSTEM_NAME], 'redis');
      assert.strictEqual(
        setSpan.attributes[ATTR_DB_QUERY_TEXT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        setSpan.attributes[ATTR_SERVER_ADDRESS],
        redisTestConfig.host
      );

      assert.ok(!(SEMATTRS_DB_SYSTEM in setSpan.attributes));
      assert.ok(!(SEMATTRS_DB_STATEMENT in setSpan.attributes));
      assert.ok(!(SEMATTRS_NET_PEER_NAME in setSpan.attributes));
    });

    it('should emit both old and new attributes when semconvStability is DUPLICATE', async () => {
      instrumentation.setConfig({
        semconvStability: SemconvStability.DUPLICATE,
      });
      const setSpan = await getSpan(client);
      assert.ok(setSpan);

      assert.strictEqual(setSpan.attributes[SEMATTRS_DB_SYSTEM], 'redis');
      assert.strictEqual(
        setSpan.attributes[SEMATTRS_DB_STATEMENT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        setSpan.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );

      assert.strictEqual(setSpan.attributes[ATTR_DB_SYSTEM_NAME], 'redis');
      assert.strictEqual(
        setSpan.attributes[ATTR_DB_QUERY_TEXT],
        'SET key [1 other arguments]'
      );
      assert.strictEqual(
        setSpan.attributes[ATTR_SERVER_ADDRESS],
        redisTestConfig.host
      );
    });
  });
});
