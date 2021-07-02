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

import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as testUtils from '@opentelemetry/test-utils';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import * as assert from 'assert';
import Instrumentation from '../src';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { getRequester, setup } from './setup';

import * as http from 'http';
import { AddressInfo } from 'net';

const instrumentation = new Instrumentation();
const memoryExporter = new InMemorySpanExporter();

const CONFIG = {
  host: process.env.OPENTELEMETRY_MEMCACHED_HOST || 'localhost',
  port: process.env.OPENTELEMETRY_MEMCACHED_PORT || '11211',
};

const DEFAULT_ATTRIBUTES = {
  'component': Instrumentation.COMPONENT,
};

describe('nestjs-core', () => {
  const provider = new NodeTracerProvider();
  const tracer = provider.getTracer('default');
  provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
  instrumentation.setTracerProvider(provider);
  let contextManager: AsyncHooksContextManager;

  beforeEach(() => {
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
    instrumentation.setConfig({});
    instrumentation.enable();
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    instrumentation.disable();
  });

  before(function () {
  });

  after(() => {});

  it('happy paths', async () => {
    const app = await setup('6');
    const request = getRequester(app);
    const path = '/users'; // v<5 expected path is /
    const url = '/users';

    console.log(await request('/users'));

    assertSpans(memoryExporter.getFinishedSpans(), [
      { service: 'test', name: 'nest.factory.create', module: 'AppModule' },
      { service: 'test', name: 'nest.guard.canActivate.UsersController(getUsers)', method: 'GET', url, path, instance: 'UsersController', callback: 'getUsers', parentSpanIdx: 2 },
      { service: 'test', name: 'UsersController(getUsers)', method: 'GET', url, path, callback: 'getUsers' },
      { service: 'test', name: 'nest.interceptor.intercept', method: 'GET', url, path, instance: 'UsersController', callback: 'getUsers', parentSpanIdx: 2 },
      { service: 'test', name: 'getUsers', callback: 'getUsers', parentSpanIdx: 3 },
    ]);
  });

  it('should properly capture errors', async () => {
    const app = await setup('6');
    const request = getRequester(app);
    const path = '/errors'; // v<5 expected path is /
    const url = '/errors'; // v<5 expected path is /

    console.log(await request('/errors'));

    assertSpans(memoryExporter.getFinishedSpans(), [
      { service: 'test', name: 'nest.factory.create', module: 'AppModule' },
      { service: 'test', name: 'nest.guard.canActivate.ErrorController(getErrors)', method: 'GET', url, path, instance: 'ErrorController', callback: 'getErrors', parentSpanIdx: 2 },
      { service: 'test', name: 'ErrorController(getErrors)', method: 'GET', url, path, callback: 'getErrors' },
      { service: 'test', name: 'nest.interceptor.intercept', method: 'GET', url, path, instance: 'ErrorController', callback: 'getErrors', parentSpanIdx: 2 },
      { service: 'test', name: 'getErrors', callback: 'getErrors', 
              status: {
                code: SpanStatusCode.ERROR,
                message: 'custom error',
              }, parentSpanIdx: 3 },
    ]);
  });
});


const assertSpans = (actualSpans: any[], expectedSpans: any[]) => {
  assert(Array.isArray(actualSpans), 'Expected `actualSpans` to be an array');

  console.log(
    'spans',
    actualSpans.map((s) => {
      return `${s.spanContext().spanId} ${s.name} < ${s.parentSpanId}`;
    })
  );

  assert(
    Array.isArray(expectedSpans),
    'Expected `expectedSpans` to be an array'
  );
  assert.strictEqual(
    actualSpans.length,
    expectedSpans.length,
    'Expected span count different from actual'
  );

  actualSpans.forEach((span, idx) => {
    // console.log('span', span);
    const expected = expectedSpans[idx];
    if (expected === null) return;
    try {
      assert.notStrictEqual(span, undefined);
      assert.notStrictEqual(expected, undefined);

      assert.strictEqual(span.attributes.component, '@nestjs/core');
      assert.strictEqual(span.attributes['nest.module'], expected.module);

      assert.strictEqual(span.name, expected.name);

      assert.strictEqual(span.attributes['http.method'], expected.method);
      assert.strictEqual(span.attributes['http.url'], expected.url);
      assert.strictEqual(span.attributes['nest.route.path'], expected.path);
      assert.strictEqual(span.attributes['nest.callback'], expected.callback);
      assert.strictEqual(span.attributes['nest.controller.instance'], expected.instance);

      for (const attr in DEFAULT_ATTRIBUTES) {
        assert.strictEqual(span.attributes[attr], DEFAULT_ATTRIBUTES[attr]);
      }
      // assert.strictEqual(
      //   typeof span.attributes['nestjs.version'],
      //   'string',
      //   'nestjs.version not specified'
      // );
      assert.deepEqual(
        span.status,
        expected.status || { code: SpanStatusCode.UNSET }
      );
      if (typeof expected.parentSpanIdx === 'number') {
        assert.strictEqual(
          span.parentSpanId,
          actualSpans[expected.parentSpanIdx].spanContext().spanId
        );
      } else {
        assert.strictEqual(
          span.parentSpanId,
          expected.parentSpan?.spanContext().spanId
        );
      }
    } catch (e) {
      e.message = `At span[${idx}]: ${e.message}`;
      throw e;
    }
  });
};

const assertMatch = (str: string, regexp: RegExp, err?: any) => {
  assert.ok(regexp.test(str), err ?? `Expected '${str} to match ${regexp}`);
};
