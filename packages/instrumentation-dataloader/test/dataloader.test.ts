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
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import { DataloaderInstrumentation } from '../src';
const instrumentation = new DataloaderInstrumentation();

// For testing that double shimming/wrapping does not occur
const extraInstrumentation = new DataloaderInstrumentation();
extraInstrumentation.disable();

import * as assert from 'assert';
import * as Dataloader from 'dataloader';
import * as crypto from 'crypto';

function getMd5HashFromIdx(idx: number) {
  return crypto.createHash('md5').update(String(idx)).digest('hex');
}

describe('DataloaderInstrumentation', () => {
  let dataloader: Dataloader<string, string, string>;
  let contextManager: AsyncLocalStorageContextManager;

  const memoryExporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  const tracer = provider.getTracer('default');

  instrumentation.setTracerProvider(provider);
  extraInstrumentation.setTracerProvider(provider);

  beforeEach(async () => {
    instrumentation.enable();
    contextManager = new AsyncLocalStorageContextManager();
    context.setGlobalContextManager(contextManager.enable());
    dataloader = new Dataloader(
      async keys =>
        keys.map((_, idx) => {
          return getMd5HashFromIdx(idx);
        }),
      { cache: true }
    );

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
      assert.strictEqual(await dataloader.load('test'), getMd5HashFromIdx(0));

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
          assert.strictEqual(
            await dataloader.load('test'),
            getMd5HashFromIdx(0)
          );

          const [_, loadSpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            loadSpan.parentSpanContext?.spanId,
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
          assert.strictEqual(
            await dataloader.load('test'),
            getMd5HashFromIdx(0)
          );

          const [_, loadSpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            loadSpan.parentSpanContext?.spanId,
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
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 3);
      const [batchSpan, clearSpan, loadSpan] =
        memoryExporter.getFinishedSpans();

      assert.deepStrictEqual(loadSpan.status, {
        code: SpanStatusCode.ERROR,
        message: 'Error message',
      });

      assert.deepStrictEqual(clearSpan.status, {
        code: SpanStatusCode.UNSET,
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
      assert.deepStrictEqual(await dataloader.loadMany(['test']), [
        getMd5HashFromIdx(0),
      ]);

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
        loadSpan.parentSpanContext?.spanId,
        loadManySpan.spanContext().spanId
      );
    });

    it('attaches span to parent', async () => {
      const rootSpan: any = tracer.startSpan('root');

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          assert.deepStrictEqual(await dataloader.loadMany(['test']), [
            getMd5HashFromIdx(0),
          ]);

          const [, , loadManySpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            loadManySpan.parentSpanContext?.spanId,
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
          assert.deepStrictEqual(await dataloader.loadMany(['test']), [
            getMd5HashFromIdx(0),
          ]);

          const [, , loadManySpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            loadManySpan.parentSpanContext?.spanId,
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
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 4);
      const [batchSpan, clearSpan, loadSpan, loadManySpan] =
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

      assert.deepStrictEqual(clearSpan.status, {
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

  describe('clear', () => {
    it('creates a span', async () => {
      dataloader.clear('test');

      // We should have exactly one span
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
      const [clearSpan] = memoryExporter.getFinishedSpans();

      assert.strictEqual(clearSpan.name, 'dataloader.clear');
      assert.strictEqual(clearSpan.kind, SpanKind.CLIENT);
    });

    it('attaches span to parent', async () => {
      const rootSpan: any = tracer.startSpan('root');

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          dataloader.clear('test');

          const [clearSpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            clearSpan.parentSpanContext?.spanId,
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
          dataloader.clear('test');

          const [clearSpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            clearSpan.parentSpanContext?.spanId,
            rootSpan.spanContext().spanId
          );
        }
      );
    });

    it('never errors', async () => {
      dataloader.clear('test');

      // All spans should be finished, but none should have errored
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
      const [clearSpan] = memoryExporter.getFinishedSpans();

      assert.deepStrictEqual(clearSpan.status, {
        code: SpanStatusCode.UNSET,
      });
    });

    it('correctly uses dataloader name (if available)', async () => {
      const namedDataloader = new Dataloader(
        async keys => keys.map((_, idx) => idx),
        { name: 'test-name' }
      );

      namedDataloader.clear('test');

      // We should have exactly one span
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
      const [clearSpan] = memoryExporter.getFinishedSpans();

      if ((namedDataloader as { name?: string | null }).name === undefined) {
        // For versions of dataloader
        // package that does not support name, we should not be adding anything to the names
        assert.strictEqual(clearSpan.name, 'dataloader.clear');
      } else {
        assert.strictEqual(clearSpan.name, 'dataloader.clear test-name');
      }
    });
  });

  describe('clearAll', () => {
    it('creates a span', async () => {
      dataloader.clearAll();

      // We should have exactly one span
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
      const [clearSpan] = memoryExporter.getFinishedSpans();

      assert.strictEqual(clearSpan.name, 'dataloader.clearAll');
      assert.strictEqual(clearSpan.kind, SpanKind.CLIENT);
    });

    it('attaches span to parent', async () => {
      const rootSpan: any = tracer.startSpan('root');

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          dataloader.clearAll();

          const [clearSpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            clearSpan.parentSpanContext?.spanId,
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
          dataloader.clearAll();

          const [clearSpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            clearSpan.parentSpanContext?.spanId,
            rootSpan.spanContext().spanId
          );
        }
      );
    });

    it('never errors', async () => {
      dataloader.clearAll();

      // All spans should be finished, but none should have errored
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
      const [clearSpan] = memoryExporter.getFinishedSpans();

      assert.deepStrictEqual(clearSpan.status, {
        code: SpanStatusCode.UNSET,
      });
    });
  });

  describe('prime', () => {
    it('creates a span', async () => {
      dataloader.prime('test', '1');

      // We should have exactly one span
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
      const [primeSpan] = memoryExporter.getFinishedSpans();

      assert.strictEqual(primeSpan.name, 'dataloader.prime');
      assert.strictEqual(primeSpan.kind, SpanKind.CLIENT);
    });

    it('attaches span to parent', async () => {
      const rootSpan: any = tracer.startSpan('root');

      await context.with(
        trace.setSpan(context.active(), rootSpan),
        async () => {
          dataloader.prime('test', '1');

          const [primeSpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            primeSpan.parentSpanContext?.spanId,
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
          dataloader.prime('test', '1');

          const [primeSpan] = memoryExporter.getFinishedSpans();
          assert.strictEqual(
            primeSpan.parentSpanContext?.spanId,
            rootSpan.spanContext().spanId
          );
        }
      );
    });

    it('never errors', async () => {
      dataloader.prime('test', '1');

      // All spans should be finished, but none should have errored
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
      const [primeSpan] = memoryExporter.getFinishedSpans();

      assert.deepStrictEqual(primeSpan.status, {
        code: SpanStatusCode.UNSET,
      });
    });

    it('correctly uses dataloader name (if available)', async () => {
      const namedDataloader = new Dataloader(
        async keys => keys.map((_, idx) => idx),
        { name: 'test-name' }
      );

      namedDataloader.prime('test', 1);

      // We should have exactly one span
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
      const [primeSpan] = memoryExporter.getFinishedSpans();

      if ((namedDataloader as { name?: string | null }).name === undefined) {
        // For versions of dataloader
        // package that does not support name, we should not be adding anything to the names
        assert.strictEqual(primeSpan.name, 'dataloader.prime');
      } else {
        assert.strictEqual(primeSpan.name, 'dataloader.prime test-name');
      }
    });

    it('correctly creates spans for chained priming', async () => {
      dataloader.prime('test', '1').prime('test2', '2');

      // We should have exactly two spans
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 2);
      const [primeSpan1, primeSpan2] = memoryExporter.getFinishedSpans();

      assert.strictEqual(primeSpan1.name, 'dataloader.prime');
      assert.strictEqual(primeSpan2.name, 'dataloader.prime');
    });
  });

  it('should not create anything if disabled', async () => {
    instrumentation.disable();

    assert.strictEqual(await dataloader.load('test'), getMd5HashFromIdx(0));
    assert.deepStrictEqual(await dataloader.loadMany(['test']), [
      getMd5HashFromIdx(0),
    ]);
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);

    // Same goes for any new dataloaders that are created while the instrumentation is disabled
    const alternativeDataloader = new Dataloader(
      async keys => keys.map(() => 1),
      { cache: false }
    );
    assert.strictEqual(await alternativeDataloader.load('test'), 1);
    assert.deepStrictEqual(await alternativeDataloader.loadMany(['test']), [1]);
    assert.strictEqual(alternativeDataloader.clearAll(), alternativeDataloader);
    assert.strictEqual(
      alternativeDataloader.clear('test'),
      alternativeDataloader
    );
    assert.strictEqual(
      alternativeDataloader.prime('test', 1),
      alternativeDataloader
    );
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  it('should not create anything if parent span is required, but missing', async () => {
    instrumentation.setConfig({ requireParentSpan: true });

    assert.strictEqual(await dataloader.load('test'), getMd5HashFromIdx(0));
    assert.deepStrictEqual(await dataloader.loadMany(['test']), [
      getMd5HashFromIdx(0),
    ]);
    assert.strictEqual(await dataloader.clear('test'), dataloader);
    assert.strictEqual(await dataloader.clearAll(), dataloader);
    assert.strictEqual(await dataloader.prime('test', '1'), dataloader);

    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  it('should avoid double shimming of functions', async () => {
    extraInstrumentation.enable();

    // Dataloader created prior to the extra instrumentation
    assert.strictEqual(await dataloader.load('test'), getMd5HashFromIdx(0));
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 2);

    assert.deepStrictEqual(await dataloader.loadMany(['test']), [
      getMd5HashFromIdx(0),
    ]);

    assert.strictEqual(memoryExporter.getFinishedSpans().length, 4);
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

  it('should not prune custom methods', async () => {
    class CustomDataLoader extends Dataloader<string, string> {
      constructor() {
        super(async keys => keys.map((_, idx) => getMd5HashFromIdx(idx)));
      }

      public async customLoad() {
        return this.load('test');
      }
    }

    const customDataloader = new CustomDataLoader();
    await customDataloader.customLoad();

    assert.strictEqual(memoryExporter.getFinishedSpans().length, 2);
    const [batchSpan, loadSpan] = memoryExporter.getFinishedSpans();

    assert.strictEqual(loadSpan.name, 'dataloader.load');
    assert.strictEqual(batchSpan.name, 'dataloader.batch');
  });
});
