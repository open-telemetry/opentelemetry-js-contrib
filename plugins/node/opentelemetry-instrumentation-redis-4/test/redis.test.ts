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

import { diag, DiagLogLevel } from '@opentelemetry/api';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
import { RedisInstrumentation } from '../src';
import type { MultiErrorReply } from '../src/internal-types';
import { strictEqual, ok, rejects, deepStrictEqual, fail } from 'assert';

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

import { createClient, WatchError } from 'redis';
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
} from '@opentelemetry/semantic-conventions';
import { RedisResponseCustomAttributeFunction } from '../src/types';
import { hrTimeToMilliseconds, suppressTracing } from '@opentelemetry/core';

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
      strictEqual(value, 'value'); // verify we did not screw up the normal functionality

      const spans = getTestSpans();
      strictEqual(spans.length, 2);

      const setSpan = spans.find(s => s.name.includes('SET'));
      ok(setSpan);
      strictEqual(setSpan?.kind, SpanKind.CLIENT);
      strictEqual(setSpan?.name, 'redis-SET');
      strictEqual(setSpan?.attributes[SEMATTRS_DB_SYSTEM], 'redis');
      strictEqual(
        setSpan?.attributes[SEMATTRS_DB_STATEMENT],
        'SET key [1 other arguments]'
      );
      strictEqual(
        setSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      strictEqual(
        setSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      strictEqual(
        setSpan?.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisTestUrl
      );

      const getSpan = spans.find(s => s.name.includes('GET'));
      ok(getSpan);
      strictEqual(getSpan?.kind, SpanKind.CLIENT);
      strictEqual(getSpan?.name, 'redis-GET');
      strictEqual(getSpan?.attributes[SEMATTRS_DB_SYSTEM], 'redis');
      strictEqual(getSpan?.attributes[SEMATTRS_DB_STATEMENT], 'GET key');
      strictEqual(
        getSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      strictEqual(
        getSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      strictEqual(
        getSpan?.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisTestUrl
      );
    });

    it('send general command', async () => {
      const res = await client.sendCommand(['SET', 'key', 'value']);
      strictEqual(res, 'OK'); // verify we did not screw up the normal functionality

      const [setSpan] = getTestSpans();

      ok(setSpan);
      strictEqual(
        setSpan?.attributes[SEMATTRS_DB_STATEMENT],
        'SET key [1 other arguments]'
      );
      strictEqual(
        setSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      strictEqual(
        setSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
    });

    it('command with error', async () => {
      await client.set('string-key', 'string-value');
      await rejects(async () => await client.incr('string-key'));

      const [_setSpan, incrSpan] = getTestSpans();

      ok(incrSpan);
      strictEqual(incrSpan?.status.code, SpanStatusCode.ERROR);
      strictEqual(
        incrSpan?.status.message,
        'ERR value is not an integer or out of range'
      );

      const exceptions = incrSpan.events.filter(
        event => event.name === 'exception'
      );
      strictEqual(exceptions.length, 1);
      strictEqual(
        exceptions?.[0].attributes?.[SEMATTRS_EXCEPTION_MESSAGE],
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

      strictEqual(span.name, 'redis-connect');

      strictEqual(span.attributes[SEMATTRS_DB_SYSTEM], 'redis');
      strictEqual(
        span.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      strictEqual(
        span.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      strictEqual(span.attributes[SEMATTRS_DB_CONNECTION_STRING], redisTestUrl);
    });

    it('sets error status on connection failure', async () => {
      const redisURL = `redis://${redisTestConfig.host}:${
        redisTestConfig.port + 1
      }`;
      const newClient = createClient({
        url: redisURL,
      });

      await rejects(newClient.connect());

      const [span] = getTestSpans();

      strictEqual(span.name, 'redis-connect');
      strictEqual(span.status.code, SpanStatusCode.ERROR);
      strictEqual(span.attributes[SEMATTRS_DB_CONNECTION_STRING], redisURL);
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

      await rejects(newClient.connect());

      const [span] = getTestSpans();

      strictEqual(span.name, 'redis-connect');
      strictEqual(span.status.code, SpanStatusCode.ERROR);
      strictEqual(
        span.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      strictEqual(
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

      await rejects(newClient.connect());

      const [span] = getTestSpans();

      strictEqual(span.name, 'redis-connect');
      strictEqual(span.status.code, SpanStatusCode.ERROR);
      strictEqual(
        span.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      strictEqual(
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
      await newClient.disconnect();

      const [span] = getTestSpans();
      strictEqual(span.name, 'redis-connect');
      strictEqual(diagErrors.length, 0, "no diag.error's");
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

      strictEqual(setKeyReply, 'OK'); // verify we did not screw up the normal functionality
      strictEqual(otherKeyValue, 'another-value'); // verify we did not screw up the normal functionality

      const [setSpan, multiSetSpan, multiGetSpan] = getTestSpans();

      ok(setSpan);

      ok(multiSetSpan);
      strictEqual(multiSetSpan.name, 'redis-SET');
      strictEqual(
        multiSetSpan.attributes[SEMATTRS_DB_STATEMENT],
        'SET key [1 other arguments]'
      );
      strictEqual(
        multiSetSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      strictEqual(
        multiSetSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      strictEqual(
        multiSetSpan?.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisTestUrl
      );

      ok(multiGetSpan);
      strictEqual(multiGetSpan.name, 'redis-GET');
      strictEqual(
        multiGetSpan.attributes[SEMATTRS_DB_STATEMENT],
        'GET another-key'
      );
      strictEqual(
        multiGetSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      strictEqual(
        multiGetSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      strictEqual(
        multiGetSpan?.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisTestUrl
      );
    });

    it('multi command with generic command', async () => {
      const [setReply] = await client
        .multi()
        .addCommand(['SET', 'key', 'value'])
        .exec();
      strictEqual(setReply, 'OK'); // verify we did not screw up the normal functionality

      const [multiSetSpan] = getTestSpans();
      ok(multiSetSpan);
      strictEqual(
        multiSetSpan.attributes[SEMATTRS_DB_STATEMENT],
        'SET key [1 other arguments]'
      );
      strictEqual(
        multiSetSpan?.attributes[SEMATTRS_NET_PEER_NAME],
        redisTestConfig.host
      );
      strictEqual(
        multiSetSpan?.attributes[SEMATTRS_NET_PEER_PORT],
        redisTestConfig.port
      );
      strictEqual(
        multiSetSpan?.attributes[SEMATTRS_DB_CONNECTION_STRING],
        redisTestUrl
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

      strictEqual(setReply, 'OK'); // verify we did not screw up the normal functionality
      ok(incrReply instanceof Error); // verify we did not screw up the normal functionality

      const [multiSetSpan, multiIncrSpan] = getTestSpans();

      ok(multiSetSpan);
      strictEqual(multiSetSpan.status.code, SpanStatusCode.UNSET);

      ok(multiIncrSpan);
      strictEqual(multiIncrSpan.status.code, SpanStatusCode.ERROR);
      strictEqual(
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
        fail('expected WatchError to be thrown and caught in try/catch');
      } catch (error) {
        ok(error instanceof WatchError);
      }

      // All the multi spans' status are set to ERROR.
      const [_watchSpan, _setSpan, multiGetSpan] = getTestSpans();
      strictEqual(multiGetSpan?.status.code, SpanStatusCode.ERROR);
      strictEqual(
        multiGetSpan?.status.message,
        'One (or more) of the watched keys has been changed'
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

      strictEqual(setKeyReply, 'OK'); // verify we did not screw up the normal functionality
      strictEqual(otherKeyValue, 'another-value'); // verify we did not screw up the normal functionality

      const [_setSpan, multiSetSpan, multiGetSpan] = getTestSpans();
      // verify that commands span started when it was added to multi and not when "sent".
      // they were called with 10 ms gap between them, so it should be reflected in the span start time
      // could be nice feature in the future to capture an event for when it is actually sent
      const startTimeDiff =
        hrTimeToMilliseconds(multiGetSpan.startTime) -
        hrTimeToMilliseconds(multiSetSpan.startTime);
      ok(
        startTimeDiff >= 9,
        `diff of start time should be >= 10 and it's ${startTimeDiff}`
      );

      const endTimeDiff =
        hrTimeToMilliseconds(multiGetSpan.endTime) -
        hrTimeToMilliseconds(multiSetSpan.endTime);
      ok(endTimeDiff < 10); // spans should all end together when multi response arrives from redis server
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
      strictEqual(setKeyReply, 'OK'); // verify we did not screw up the normal functionality
      strictEqual(otherKeyValue, 'another-value'); // verify we did not screw up the normal functionality

      const [_setSpan, multiSetSpan, multiGetSpan] = getTestSpans();

      ok(multiSetSpan);
      strictEqual(multiSetSpan.attributes['test.cmd.name'], 'SET');
      deepStrictEqual(multiSetSpan.attributes['test.cmd.args'], [
        'key',
        'value',
      ]);
      strictEqual(multiSetSpan.attributes['test.db.response'], 'OK');

      ok(multiGetSpan);
      strictEqual(multiGetSpan.attributes['test.cmd.name'], 'GET');
      deepStrictEqual(multiGetSpan.attributes['test.cmd.args'], [
        'another-key',
      ]);
      strictEqual(multiGetSpan.attributes['test.db.response'], 'another-value');
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
        strictEqual(span.attributes[SEMATTRS_DB_STATEMENT], 'SET key value');
      });

      it('dbStatementSerializer throws', async () => {
        const dbStatementSerializer = () => {
          throw new Error('dbStatementSerializer error');
        };

        instrumentation.setConfig({ dbStatementSerializer });
        await client.set('key', 'value');
        const [span] = getTestSpans();
        ok(span);
        ok(!(SEMATTRS_DB_STATEMENT in span.attributes));
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
        ok(span);
        strictEqual(span.attributes['test.cmd.name'], 'SET');
        deepStrictEqual(span.attributes['test.cmd.args'], ['key', 'value']);
        strictEqual(span.attributes['test.db.response'], 'OK');
      });

      it('responseHook throws', async () => {
        const responseHook = () => {
          throw new Error('responseHook error');
        };
        instrumentation.setConfig({ responseHook });
        const res = await client.set('key', 'value');
        strictEqual(res, 'OK'); // package is still functional
        const [span] = getTestSpans();
        ok(span);
      });
    });

    describe('requireParentSpan', () => {
      it('set to true', async () => {
        instrumentation.setConfig({ requireParentSpan: true });

        // no parent span => no redis span
        const res = await client.set('key', 'value');
        strictEqual(res, 'OK'); // verify we did not screw up the normal functionality
        ok(getTestSpans().length === 0);

        // has ambient span => redis span
        const span = trace.getTracer('test').startSpan('test span');
        await context.with(trace.setSpan(context.active(), span), async () => {
          const res = await client.set('key', 'value');
          strictEqual(res, 'OK'); // verify we did not screw up the normal functionality
          ok(getTestSpans().length === 1);
        });
        span.end();
      });
    });
  });
});
