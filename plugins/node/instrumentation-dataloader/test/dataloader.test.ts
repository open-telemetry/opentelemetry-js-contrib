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
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

import { DataloaderInstrumentation } from '../src';
const instrumentation = new DataloaderInstrumentation();

// For testing that double shimming/wrapping does not occur
const extraInstrumentation = new DataloaderInstrumentation();
extraInstrumentation.disable();

import * as assert from 'assert';
import * as Dataloader from 'dataloader';

describe('DataloaderInstrumentation', () => {
  let dataloader: Dataloader<string, number>;
  let contextManager: AsyncHooksContextManager;

  const memoryExporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider();
  const tracer = provider.getTracer('default');

  instrumentation.setTracerProvider(provider);
  extraInstrumentation.setTracerProvider(provider);
  provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

  beforeEach(async () => {
    instrumentation.enable();
    contextManager = new AsyncHooksContextManager();
    context.setGlobalContextManager(contextManager.enable());
    dataloader = new Dataloader(async keys => keys.map((_, idx) => idx), {
      cache: false,
    });
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    instrumentation.setConfig({});
    instrumentation.disable();
    extraInstrumentation.disable();
  });

  describe('load', () => {
    it('creates a span', async () => {
      assert.strictEqual(await dataloader.load('test'), 0);

      // We should have exactly two spans (one for .load and one for the following batch)
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 2);
      const [batchSpan, loadSpan] = memoryExporter.getFinishedSpans();

      assert.strictEqual(loadSpan.name, 'dataloader.load');
      assert.strictEqual(loadSpan.kind, SpanKind.CLIENT);

      // Batch span should also be linked to load span
      assert.strictEqual(batchSpan.name, 'dataloader.batch');
      assert.strictEqual(batchSpan.kind, SpanKind.INTERNAL);
      assert.deepStrictEqual(batchSpan.links, [
        { context: loadSpan.spanContext(), attributes: {} },
      ]);
    });

    it('attaches span to parent', async () => {
      const rootSpan: any = tracer.startSpan('root');

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          assert.strictEqual(await dataloader.load('test'), 0);

          const [_, loadSpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            loadSpan.parentSpanId,
            rootSpan.spanContext().spanId
          );
        }
      );
    });

    it('attaches span to parent with required parent', async () => {
      instrumentation.setConfig({ requireParentSpan: true });
      const rootSpan: any = tracer.startSpan('root');

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          assert.strictEqual(await dataloader.load('test'), 0);

          const [_, loadSpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            loadSpan.parentSpanId,
            rootSpan.spanContext().spanId
          );
        }
      );
    });

    it('correctly catches exceptions', async () => {
      const failingDataloader = new Dataloader(async keys => {
        throw new Error('Error message');
      });

      try {
        await failingDataloader.load('test');
        assert.fail('.load should throw');
      } catch (e) {}

      // All spans should be finished, both load as well as the batch ones should have errored
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 2);
      const [batchSpan, loadSpan] = memoryExporter.getFinishedSpans();

      assert.deepStrictEqual(loadSpan.status, {
        code: SpanStatusCode.ERROR,
        message: 'Error message',
      });

      assert.deepStrictEqual(batchSpan.status, {
        code: SpanStatusCode.ERROR,
        message: 'Error message',
      });
    });

    it('correctly uses dataloader name (if available)', async () => {
      const namedDataloader = new Dataloader(
        async keys => keys.map((_, idx) => idx),
        { name: 'test-name' }
      );

      assert.strictEqual(await namedDataloader.load('test'), 0);

      // We should have exactly two spans (one for .load and one for the following batch)
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 2);
      const [batchSpan, loadSpan] = memoryExporter.getFinishedSpans();

      if ((namedDataloader as { name?: string | null }).name === undefined) {
        // For versions of dataloader package that does not support name, we should
        // not be adding anything to the names
        assert.strictEqual(loadSpan.name, 'dataloader.load');
        assert.strictEqual(batchSpan.name, 'dataloader.batch');
      } else {
        assert.strictEqual(loadSpan.name, 'dataloader.load test-name');
        assert.strictEqual(batchSpan.name, 'dataloader.batch test-name');
      }
    });
  });

  describe('loadMany', () => {
    it('creates an additional span', async () => {
      assert.deepStrictEqual(await dataloader.loadMany(['test']), [0]);

      // We should have exactly three spans (one for .loadMany, one for the underlying .load
      // and one for the following batch)
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 3);
      const [batchSpan, loadSpan, loadManySpan] =
        memoryExporter.getFinishedSpans();

      assert.strictEqual(batchSpan.name, 'dataloader.batch');
      assert.strictEqual(batchSpan.kind, SpanKind.INTERNAL);
      assert.deepStrictEqual(batchSpan.links, [
        { context: loadSpan.spanContext(), attributes: {} },
      ]);

      assert.strictEqual(loadManySpan.name, 'dataloader.loadMany');
      assert.strictEqual(loadManySpan.kind, SpanKind.CLIENT);

      assert.strictEqual(loadSpan.name, 'dataloader.load');
      assert.strictEqual(loadSpan.kind, SpanKind.CLIENT);
      assert.strictEqual(
        loadSpan.parentSpanId,
        loadManySpan.spanContext().spanId
      );
    });

    it('attaches span to parent', async () => {
      const rootSpan: any = tracer.startSpan('root');

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          assert.deepStrictEqual(await dataloader.loadMany(['test']), [0]);

          const [, , loadManySpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            loadManySpan.parentSpanId,
            rootSpan.spanContext().spanId
          );
        }
      );
    });

    it('attaches span to parent with required parent', async () => {
      instrumentation.setConfig({ requireParentSpan: true });
      const rootSpan: any = tracer.startSpan('root');

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          assert.deepStrictEqual(await dataloader.loadMany(['test']), [0]);

          const [, , loadManySpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            loadManySpan.parentSpanId,
            rootSpan.spanContext().spanId
          );
        }
      );
    });

    it('never errors, even if underlying load fails', async () => {
      const failingDataloader = new Dataloader(async keys => {
        throw new Error('Error message');
      });

      try {
        await failingDataloader.loadMany(['test']);
      } catch (e) {
        assert.fail('.loadMany should never throw');
      }

      // All spans should be finished, both load as well as the batch ones should have errored
      // but loadMany one should not have errored
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 3);
      const [batchSpan, loadSpan, loadManySpan] =
        memoryExporter.getFinishedSpans();

      assert.deepStrictEqual(loadSpan.status, {
        code: SpanStatusCode.ERROR,
        message: 'Error message',
      });

      assert.deepStrictEqual(batchSpan.status, {
        code: SpanStatusCode.ERROR,
        message: 'Error message',
      });

      assert.deepStrictEqual(loadManySpan.status, {
        code: SpanStatusCode.UNSET,
      });
    });

    it('correctly uses a generated name in spans', async () => {
      const namedDataloader = new Dataloader(
        async keys => keys.map((_, idx) => idx),
        { name: 'test-name' }
      );

      assert.deepStrictEqual(await namedDataloader.loadMany(['test']), [0]);

      // We should have exactly three spans (one for .loadMany, one for the underlying .load
      // and one for the following batch)
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 3);
      const [batchSpan, loadSpan, loadManySpan] =
        memoryExporter.getFinishedSpans();

      if ((namedDataloader as { name?: string | null }).name === undefined) {
        // For versions of dataloader package that does not support name, we should
        // not be adding anything to the names
        assert.strictEqual(batchSpan.name, 'dataloader.batch');
        assert.strictEqual(loadManySpan.name, 'dataloader.loadMany');
        assert.strictEqual(loadSpan.name, 'dataloader.load');
      } else {
        assert.strictEqual(batchSpan.name, 'dataloader.batch test-name');
        assert.strictEqual(loadManySpan.name, 'dataloader.loadMany test-name');
        assert.strictEqual(loadSpan.name, 'dataloader.load test-name');
      }
    });
  });

  it('should not create anything if disabled', async () => {
    instrumentation.disable();

    assert.strictEqual(await dataloader.load('test'), 0);
    assert.deepStrictEqual(await dataloader.loadMany(['test']), [0]);
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

    // Same goes for any new dataloaders that are created while the instrumentation is disabled
    const alternativeDataloader = new Dataloader(
      async keys => keys.map(() => 1),
      { cache: false }
    );
    assert.strictEqual(await alternativeDataloader.load('test'), 1);
    assert.deepStrictEqual(await alternativeDataloader.loadMany(['test']), [1]);
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  it('should not create anything if parent span is required, but missing', async () => {
    instrumentation.setConfig({ requireParentSpan: true });

    assert.strictEqual(await dataloader.load('test'), 0);
    assert.deepStrictEqual(await dataloader.loadMany(['test']), [0]);
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  it('should avoid double shimming of functions', async () => {
    extraInstrumentation.enable();

    // Dataloader created prior to the extra instrumentation
    assert.strictEqual(await dataloader.load('test'), 0);
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 2);

    assert.deepStrictEqual(await dataloader.loadMany(['test']), [0]);
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 5);
    memoryExporter.reset();

    // Same goes for any new dataloaders that are created after the extra instrumentation is added
    const alternativeDataloader = new Dataloader(
      async keys => keys.map(() => 1),
      { cache: false }
    );
    assert.strictEqual(await alternativeDataloader.load('test'), 1);
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 2);

    assert.deepStrictEqual(await alternativeDataloader.loadMany(['test']), [1]);
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 5);
  });
});
