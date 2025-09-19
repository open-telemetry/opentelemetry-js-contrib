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

import * as semver from 'semver';

import { context, SpanStatusCode } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { NestInstrumentation } from '../src';
import { getRequester, setup, App } from './setup';

import * as util from 'util';

const LIB_VERSION = require('@nestjs/core/package.json').version;

// This is a meagre testing of just a single value of
// OTEL_SEMCONV_STABILITY_OPT_IN, because testing multiple configurations of
// `NestInstrumentation` in this all-in-one-process is more trouble than it
// it is worth for the ~6mo migration process.
process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http/dup';

const instrumentation = new NestInstrumentation();
const memoryExporter = new InMemorySpanExporter();

util.inspect.defaultOptions.depth = 3;
util.inspect.defaultOptions.breakLength = 200;

describe('nestjs-core', () => {
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  instrumentation.setTracerProvider(provider);
  let contextManager: AsyncLocalStorageContextManager;
  let app: App;
  let request = async (path: string): Promise<unknown> => {
    throw new Error('Not yet initialized.');
  };

  beforeEach(async () => {
    contextManager = new AsyncLocalStorageContextManager();
    context.setGlobalContextManager(contextManager.enable());
    instrumentation.setConfig({});
    instrumentation.enable();

    app = await setup(LIB_VERSION);
    request = getRequester(app);
  });

  afterEach(async () => {
    await app.close();

    memoryExporter.reset();
    context.disable();
    instrumentation.disable();
  });

  it('should capture setup', async () => {
    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'app_creation',
        service: 'test',
        name: 'Create Nest App',
        module: 'AppModule',
      },
    ]);
  });

  it('should capture requests', async () => {
    const path = semver.intersects(LIB_VERSION, '<5.0.0') ? '/' : '/users';
    const url = '/users';
    const instance = 'UsersController';
    const callback = 'getUsers';

    assert.strictEqual(await request('/users'), 'Hello, world!\n');

    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'app_creation',
        service: 'test',
        name: 'Create Nest App',
        module: 'AppModule',
      },
      {
        type: 'handler',
        service: 'test',
        name: callback,
        callback,
        parentSpanName: `${instance}.${callback}`,
      },
      {
        type: 'request_context',
        service: 'test',
        name: `${instance}.${callback}`,
        method: 'GET',
        url,
        path,
        callback,
      },
    ]);
  });

  it('should not overwrite metadata set on the request handler', async () => {
    const path = semver.intersects(LIB_VERSION, '<5.0.0') ? '/' : '/metadata';
    const url = '/metadata';
    const instance = 'MetadataController';
    const callback = 'getMetadata';

    assert.deepStrictEqual(await request('/metadata'), '["path","method"]');

    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'app_creation',
        service: 'test',
        name: 'Create Nest App',
        module: 'AppModule',
      },
      {
        type: 'handler',
        service: 'test',
        name: callback,
        callback,
        parentSpanName: `${instance}.${callback}`,
      },
      {
        type: 'request_context',
        service: 'test',
        name: `${instance}.${callback}`,
        method: 'GET',
        url,
        path,
        callback,
      },
    ]);
  });

  it('should capture errors', async () => {
    const path = semver.intersects(LIB_VERSION, '<5.0.0') ? '/' : '/errors';
    const url = '/errors';
    const instance = 'ErrorController';
    const callback = 'getError';

    assert.strictEqual(
      await request('/errors'),
      '{"statusCode":500,"message":"Internal server error"}'
    );

    assertSpans(memoryExporter.getFinishedSpans(), [
      {
        type: 'app_creation',
        service: 'test',
        name: 'Create Nest App',
        module: 'AppModule',
      },
      {
        type: 'handler',
        service: 'test',
        name: callback,
        callback,
        status: {
          code: SpanStatusCode.ERROR,
          message: 'custom error',
        },
        parentSpanName: `${instance}.${callback}`,
      },
      {
        type: 'request_context',
        service: 'test',
        name: `${instance}.${callback}`,
        method: 'GET',
        url,
        path,
        callback,
        status: {
          code: SpanStatusCode.ERROR,
          message: 'custom error',
        },
      },
    ]);
  });
});

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

      assert.strictEqual(span.attributes.component, '@nestjs/core');
      assert.strictEqual(span.attributes['nestjs.module'], expected.module);

      assert.strictEqual(span.name, expected.name);

      // Because OTEL_SEMCONV_STABILITY_OPT_IN=http/dup is being set for testing
      // we expect both the deprecated:
      assert.strictEqual(span.attributes['http.method'], expected.method);
      assert.strictEqual(span.attributes['http.url'], expected.url);
      // ... and stable HTTP semconv attributes:
      assert.strictEqual(
        span.attributes['http.request.method'],
        expected.method
      );
      assert.strictEqual(span.attributes['url.full'], expected.url);

      assert.strictEqual(span.attributes['http.route'], expected.path);
      assert.strictEqual(span.attributes['nestjs.type'], expected.type);
      assert.strictEqual(span.attributes['nestjs.callback'], expected.callback);
      assert.strictEqual(
        span.attributes['nest.controller.instance'],
        expected.instance
      );

      assert.strictEqual(
        span.attributes.component,
        NestInstrumentation.COMPONENT
      );
      assert.strictEqual(
        typeof span.attributes['nestjs.version'],
        'string',
        'nestjs.version not specified'
      );
      assert.deepEqual(
        span.status,
        expected.status || { code: SpanStatusCode.UNSET }
      );
      if (typeof expected.parentSpanIdx === 'number') {
        assert.strictEqual(
          span.parentSpanContext?.spanId,
          actualSpans[expected.parentSpanIdx].spanContext().spanId
        );
      } else if (typeof expected.parentSpanName === 'string') {
        const parentSpan = actualSpans.find(
          s => s.name === expected.parentSpanName
        );
        assert.notStrictEqual(
          parentSpan,
          undefined,
          `Cannot find span named ${expected.parentSpanName} expected to be the parent of ${span.name}`
        );
        assert.strictEqual(
          span.parentSpanContext?.spanId,
          parentSpan.spanContext().spanId,
          `Expected "${expected.parentSpanName}" to be the parent of "${
            span.name
          }", but found "${
            actualSpans.find(
              s => s.spanContext().spanId === span.parentSpanContext?.spanId
            ).name
          }"`
        );
      } else if (expected.parentSpan !== null) {
        assert.strictEqual(
          span.parentSpanContext?.spanId,
          expected.parentSpan?.spanContext().spanId
        );
      }
    } catch (e: any) {
      e.message = `At span[${idx}] "${span.name}": ${e.message}`;
      throw e;
    }
  });
};
