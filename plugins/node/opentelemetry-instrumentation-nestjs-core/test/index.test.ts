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
  [SemanticAttributes.DB_SYSTEM]: Instrumentation.COMPONENT,
  [SemanticAttributes.NET_PEER_NAME]: CONFIG.host,
  [SemanticAttributes.NET_PEER_PORT]: CONFIG.port,
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
    const path = '/users' // v<5 expected path is /

    console.log(await request('/users'));

    assert.ok(memoryExporter.getFinishedSpans().length > 0);
    assertSpans(memoryExporter.getFinishedSpans(), [{}]);
  })
});


            // expect(spans[0]).to.have.property('service', 'test')
            // expect(spans[0]).to.have.property('name', 'nest.factory.create')
            // expect(spans[0].meta).to.have.property('component', 'nest')
            // expect(spans[0].meta).to.have.property('nest.module', 'AppModule')

            // expect(spans[1]).to.have.property('service', 'test')
            // expect(spans[1]).to.have.property('name', 'UsersController(getUsers)')
            // expect(spans[1].meta).to.have.property('component', 'nest')
            // expect(spans[1].meta).to.have.property('http.method', 'GET')
            // expect(spans[1].meta).to.have.property('http.url', '/users')
            // expect(spans[1].meta).to.have.property('nest.route.path', routePath)
            // expect(spans[1].meta).to.have.property('nest.callback', 'getUsers')

            // expect(spans[2]).to.have.property('service', 'test')
            // expect(spans[2]).to.have.property('name', 'nest.guard.canActivate.UsersController(getUsers)')
            // expect(spans[2].meta).to.have.property('component', 'nest')
            // expect(spans[2].meta).to.have.property('http.url', '/users')
            // expect(spans[2].meta).to.have.property('nest.controller.instance', 'UsersController')
            // expect(spans[2].meta).to.have.property('nest.route.path', routePath)
            // expect(spans[2].meta).to.have.property('nest.callback', 'getUsers')
            // expect(spans[2].parent_id.toString()).to.equal(spans[1].span_id.toString())

            // expect(spans[3]).to.have.property('service', 'test')
            // expect(spans[3]).to.have.property('name', 'nest.interceptor.intercept')
            // expect(spans[3].meta).to.have.property('component', 'nest')
            // expect(spans[3].meta).to.have.property('http.method', 'GET')
            // expect(spans[3].meta).to.have.property('http.url', '/users')
            // expect(spans[3].meta).to.have.property('nest.callback', 'getUsers')
            // expect(spans[3].meta).to.have.property('nest.route.path', routePath)
            // expect(spans[3].meta).to.have.property('nest.controller.instance', 'UsersController')
            // expect(spans[3].parent_id.toString()).to.equal(spans[1].span_id.toString())

            // expect(spans[4]).to.have.property('service', 'test')
            // expect(spans[4]).to.have.property('name', 'getUsers')
            // expect(spans[4].meta).to.not.have.property('error')
            // expect(spans[4].meta).to.have.property('component', 'nest')
            // expect(spans[4].meta).to.have.property('nest.callback', 'getUsers')
            // expect(spans[4].parent_id.toString()).to.equal(spans[3].span_id.toString())


const assertSpans = (actualSpans: any[], expectedSpans: any[]) => {
  assert(Array.isArray(actualSpans), 'Expected `actualSpans` to be an array');
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
    const expected = expectedSpans[idx];
    if (expected === null) return;
    try {
      assert.notStrictEqual(span, undefined);
      assert.notStrictEqual(expected, undefined);
      assertMatch(span.name, new RegExp(expected.op));
      assertMatch(span.name, new RegExp(expected.key));
      assert.strictEqual(span.kind, SpanKind.CLIENT);
      assert.strictEqual(span.attributes['db.statement'], expected.statement);
      for (const attr in DEFAULT_ATTRIBUTES) {
        assert.strictEqual(span.attributes[attr], DEFAULT_ATTRIBUTES[attr]);
      }
      assert.strictEqual(span.attributes['db.memcached.key'], expected.key);
      assert.strictEqual(
        typeof span.attributes['memcached.version'],
        'string',
        'memcached.version not specified'
      );
      assert.deepEqual(
        span.status,
        expected.status || { code: SpanStatusCode.UNSET }
      );
      assert.strictEqual(span.attributes['db.operation'], expected.op);
      assert.strictEqual(
        span.parentSpanId,
        expected.parentSpan?.spanContext().spanId
      );
    } catch (e) {
      e.message = `At span[${idx}]: ${e.message}`;
      throw e;
    }
  });
};

const assertMatch = (str: string, regexp: RegExp, err?: any) => {
  assert.ok(regexp.test(str), err ?? `Expected '${str} to match ${regexp}`);
};
