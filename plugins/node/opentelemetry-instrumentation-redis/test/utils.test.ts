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

import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { context, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import * as assert from 'assert';
import * as redisTypes from 'redis';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { RedisInstrumentation } from '../src';

const instrumentation = new RedisInstrumentation();
instrumentation.enable();
instrumentation.disable();

const memoryExporter = new InMemorySpanExporter();

const CONFIG = {
  host: process.env.OPENTELEMETRY_REDIS_HOST || 'localhost',
  port: Number(process.env.OPENTELEMETRY_REDIS_PORT) || 63790,
};

const URL = `redis://${CONFIG.host}:${CONFIG.port}`;

describe('utils', () => {
  const provider = new NodeTracerProvider();
  const tracer = provider.getTracer('external');
  let redis: typeof redisTypes;
  const shouldTestLocal = process.env.RUN_REDIS_TESTS_LOCAL;
  const shouldTest = process.env.RUN_REDIS_TESTS || shouldTestLocal;

  let contextManager: AsyncHooksContextManager;
  beforeEach(() => {
    contextManager = new AsyncHooksContextManager().enable();
    context.setGlobalContextManager(contextManager);
  });

  afterEach(() => {
    context.disable();
  });

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

    redis = require('redis');
    provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();
  });

  describe('#getTracedCreateStreamTrace()', () => {
    it('should add the "stream" property', done => {
      const span = tracer.startSpan('test span');
      let client: redisTypes.RedisClient;
      const readyHandler = () => {
        // eslint-disable-next-line no-prototype-builtins
        assert.strictEqual(client.hasOwnProperty('stream'), true);
        assert.notStrictEqual(client.stream, undefined);
        client.quit(done);
      };
      const errorHandler = (err: Error) => {
        assert.ifError(err);
        client.quit(done);
      };

      context.with(trace.setSpan(context.active(), span), () => {
        client = redis.createClient(URL);
        client.on('ready', readyHandler);
        client.on('error', errorHandler);
      });
    });
  });
});
