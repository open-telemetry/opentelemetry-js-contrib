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

import * as assert from 'assert';
// const Redis = require('ioredis-mock');
// rewiremock('ioredis').with(Redis);
// rewiremock.enable();

import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type * as bullmq from 'bullmq';

import { BullMQInstrumentation } from '../src';
import IORedis from 'ioredis';
import {
  BullMQInstrumentationConfig,
  defaultConfig,
} from '../src/instrumentation';

import * as util from 'util';

// rewiremock.disable();

let Queue: typeof bullmq.Queue;
let FlowProducer: typeof bullmq.FlowProducer;
let Worker: typeof bullmq.Worker;

function getWait(): [
  Promise<void>,
  (value: void) => void,
  (reason: unknown) => void
] {
  let resolve: (value: void) => void;
  let reject: (reason: unknown) => void;
  const p = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return [p, resolve!, reject!];
}

// function printSpans(spans: ReadableSpan[]) {
//   console.log(
//     util.inspect(
//       spans.map((span) => ({
//         name: span.name,
//         parent: spans.find((s) => s.spanContext().spanId === span.parentSpanId)
//           ?.name,
//         trace: span.spanContext().traceId,
//         kind: SpanKind[span.kind],
//         attributes: span.attributes,
//         events: span.events,
//         links: span.links,
//       })),
//       { depth: null },
//     ),
//   );
// }

function assertSpanParent(span: ReadableSpan, parent: ReadableSpan) {
  assert.strictEqual(span.parentSpanId, parent.spanContext().spanId);
}

function assertDifferentTrace(span: ReadableSpan, parent: ReadableSpan) {
  assert.notStrictEqual(span.parentSpanId, parent.spanContext().spanId);
  assert.notStrictEqual(
    span.spanContext().traceId,
    parent.spanContext().traceId
  );
}

function assertSpanLink(span: ReadableSpan, linked: ReadableSpan) {
  assert.ok(
    span.links.some(
      link =>
        link.context.spanId === linked.spanContext().spanId &&
        link.context.traceId === linked.spanContext().traceId
    )
  );
}

function assertRootSpan(span: ReadableSpan) {
  assert.strictEqual(span.parentSpanId, undefined);
}

function assertMessagingSystem(span: ReadableSpan) {
  assert.strictEqual(span.attributes['messaging.system'], 'bullmq');
}

function assertContains(
  object: Record<any, unknown>,
  pairs: Record<any, unknown>
) {
  contextualizeError(
    () => {
      Object.entries(pairs).forEach(([key, value]) => {
        assert.deepStrictEqual(object[key], value);
      });
    },
    { actual: object, expected: pairs }
  );
}

// Performs a set equality comparison
function assertEqualSet<T>(actual: Iterable<T>, expected: Iterable<T>) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);

  contextualizeError(
    () => {
      assert.strictEqual(actualSet.size, expectedSet.size);
      for (const value of actual) {
        assert.ok(expectedSet.has(value));
      }
    },
    {
      actual: actualSet.values,
      expected: expectedSet.values,
    }
  );
}

function assertDoesNotContain(object: Record<any, unknown>, keys: string[]) {
  keys.forEach(key => {
    contextualizeError(
      () => {
        assert.strictEqual(object[key], undefined);
      },
      { key }
    );
  });
}

function contextualizeError(fn: () => void, context: Record<string, any>) {
  try {
    fn();
  } catch (e: any) {
    Object.entries(context).forEach(([key, value]) => {
      e.message += `\n${key}: ${util.format(value)}`;
    });
    throw e;
  }
}

describe('bullmq', () => {
  const shouldTestLocal = process.env.RUN_REDIS_TESTS_LOCAL;
  const shouldTest = process.env.RUN_REDIS_TESTS || shouldTestLocal;

  const connection = {
    host: process.env.OPENTELEMETRY_REDIS_HOST || 'localhost',
    port: parseInt(process.env.OPENTELEMETRY_REDIS_PORT || '63790', 10),
  };

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

  const instrumentation = new BullMQInstrumentation();
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  const contextManager = new AsyncHooksContextManager();

  beforeEach(() => {
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    instrumentation.setTracerProvider(provider);
    trace.setGlobalTracerProvider(provider);
    instrumentation.setConfig(defaultConfig);
    instrumentation.enable();
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());

    /* eslint-disable @typescript-eslint/no-var-requires */
    Worker = require('bullmq').Worker;
    Queue = require('bullmq').Queue;
    FlowProducer = require('bullmq').FlowProducer;
    /* eslint-enable @typescript-eslint/no-var-requires */

    const client = new IORedis(connection);
    client.flushall();
  });

  afterEach(() => {
    // printSpans(memoryExporter.getFinishedSpans());
    contextManager.disable();
    contextManager.enable();
    memoryExporter.reset();
    instrumentation.disable();
  });

  describe('Queue', () => {
    it('should not generate any spans when disabled', async () => {
      instrumentation.disable();
      const q = new Queue('queueName', { connection });
      await q.add('jobName', { test: 'yes' });

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);
    });

    describe('when requireParentSpanForPublish is true', async () => {
      beforeEach(() => {
        instrumentation.setConfig({ requireParentSpanForPublish: true });
      });

      it('should not create a queue span for add when there is no parent span', async () => {
        const q = new Queue('queueName', { connection });
        await q.add('jobName', { test: 'yes' });

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 0);
      });

      it('should not create a queue span and job spans for addBulk when there is no parent span', async () => {
        const q = new Queue('queueName', { connection });
        await q.addBulk([
          { name: 'jobName1', data: { test: 'yes' } },
          { name: 'jobName2', data: { test: 'yes' } },
        ]);

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 0);
      });

      it('should create a queue span for add when there is a parent span', async () => {
        await trace
          .getTracer('default')
          .startActiveSpan('root', async rootSpan => {
            const q = new Queue('queueName', { connection });
            await q.add('jobName', { test: 'yes' });

            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 1);

            rootSpan.end();
          });
      });

      it('should create a queue span and many job spans for addBulk when there is a parent span', async () => {
        await trace
          .getTracer('default')
          .startActiveSpan('root', async rootSpan => {
            const q = new Queue('queueName', { connection });
            await q.addBulk([
              { name: 'jobName1', data: { test: 'yes' } },
              { name: 'jobName2', data: { test: 'yes' } },
            ]);

            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 3);

            rootSpan.end();
          });
      });
    });

    it('should create a queue span and no job span for add', async () => {
      // These configuration options should not affect its behaviour, as this
      // is neither a bulk operation nor a flow operation.
      instrumentation.setConfig({
        emitCreateSpansForBulk: false,
        emitCreateSpansForFlow: false,
      });

      const q = new Queue('queueName', { connection });
      await q.add('jobName', { test: 'yes' });

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      spans.forEach(assertMessagingSystem);

      const queueAddSpan = spans.find(
        span => span.name === 'queueName publish'
      );
      assert.notStrictEqual(queueAddSpan, undefined);
      assert.strictEqual(queueAddSpan?.kind, SpanKind.PRODUCER);
      assertContains(queueAddSpan?.attributes!, {
        'messaging.destination': 'queueName',
        'messaging.bullmq.operation.name': 'Queue.add',
        'messaging.operation': 'publish',
        'messaging.bullmq.job.name': 'jobName',
      });

      // TODO: why is there no message ID?
      assertDoesNotContain(queueAddSpan?.attributes!, [
        'messaging.message_id',
        'messaging.bullmq.job.parentOpts.parentKey',
        'messaging.bullmq.job.parentOpts.flowChildrenKey',
      ]);

      assertRootSpan(queueAddSpan!);
    });

    it('should contain a message id when explicitly provided in the job span', async () => {
      const q = new Queue('queueName', { connection });
      await q.add('jobName', { test: 'yes' }, { jobId: 'foobar' });

      const spans = memoryExporter.getFinishedSpans();
      const queueAddSpan = spans.find(
        span => span.name === 'queueName publish'
      );
      assert.notStrictEqual(queueAddSpan, undefined);
      assertContains(queueAddSpan?.attributes!, {
        'messaging.bullmq.job.name': 'jobName',
        'messaging.message_id': 'foobar',
      });
    });

    it('should contain the job delay in the job span', async () => {
      const q = new Queue('queueName', { connection });
      await q.add('jobName', { test: 'yes' }, { delay: 1000 });

      const spans = memoryExporter.getFinishedSpans();
      const queueAddSpan = spans.find(
        span => span.name === 'queueName publish'
      );
      assert.notStrictEqual(queueAddSpan, undefined);
      assertContains(queueAddSpan?.attributes!, {
        'messaging.bullmq.job.opts.delay': 1000,
      });
    });

    it('should create a queue span and many job spans for addBulk', async () => {
      const q = new Queue('queueName', { connection });
      await q.addBulk([
        { name: 'jobName1', data: { test: 'yes' } },
        { name: 'jobName2', data: { test: 'yes' } },
      ]);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 3);
      spans.forEach(assertMessagingSystem);

      const queueAddBulkSpan = spans.find(
        span => span.name === 'queueName publish'
      );
      assert.notStrictEqual(queueAddBulkSpan, undefined);
      assertContains(queueAddBulkSpan?.attributes!, {
        'messaging.destination': 'queueName',
        'messaging.bullmq.operation.name': 'Queue.addBulk',
        'messaging.operation': 'publish',
        'messaging.bullmq.job.bulk.names': ['jobName1', 'jobName2'],
        'messaging.bullmq.job.bulk.count': 2,
      });
      assertDoesNotContain(queueAddBulkSpan?.attributes!, [
        'messaging.bullmq.job.name',
      ]);

      const jobAddSpans = spans.filter(
        span => span.name === 'queueName create'
      );

      assert.strictEqual(jobAddSpans.length, 2);

      jobAddSpans.forEach(jobAddSpan => {
        assert.notStrictEqual(jobAddSpan, undefined);

        assertContains(jobAddSpan?.attributes!, {
          'messaging.bullmq.operation.name': 'Job.addJob',
          'messaging.operation': 'create',
        });

        assertSpanParent(jobAddSpan!, queueAddBulkSpan!);
      });

      assertEqualSet(
        jobAddSpans.map(
          jobAddSpan => jobAddSpan.attributes!['messaging.bullmq.job.name']
        ),
        ['jobName1', 'jobName2']
      );

      assertRootSpan(queueAddBulkSpan!);
    });
  });

  it('should not create any job spans for addBulk when emitCreateSpansForBulk is false', async () => {
    instrumentation.setConfig({ emitCreateSpansForBulk: false });

    const q = new Queue('queueName', { connection });
    await q.addBulk([
      { name: 'jobName1', data: { test: 'yes' } },
      { name: 'jobName2', data: { test: 'yes' } },
    ]);

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    spans.forEach(assertMessagingSystem);

    const queueAddBulkSpan = spans.find(
      span => span.name === 'queueName publish'
    );
    assert.notStrictEqual(queueAddBulkSpan, undefined);
  });

  describe('FlowProducer', () => {
    it('should not generate any spans when disabled', async () => {
      instrumentation.disable();
      const q = new FlowProducer({ connection });
      await q.add({ name: 'jobName', queueName: 'queueName' });

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);
    });

    describe('when requireParentSpanForPublish is true', async () => {
      beforeEach(() => {
        instrumentation.setConfig({ requireParentSpanForPublish: true });
      });

      it('should not create a queue span for add and job spans when there is no parent span', async () => {
        const q = new FlowProducer({ connection });
        await q.add({
          name: 'jobName',
          queueName: 'queueName',
          children: [
            {
              name: 'childJobName',
              queueName: 'childQueueName',
            },
          ],
        });

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 0);
      });

      it('should not create a queue span and job spans for addBulk when there is no parent span', async () => {
        const q = new FlowProducer({ connection });
        await q.addBulk([
          { name: 'jobName1', queueName: 'queueName', data: { test: 'yes' } },
          { name: 'jobName2', queueName: 'queueName', data: { test: 'yes' } },
        ]);

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 0);
      });

      it('should create a queue span for add and job spans when there is a parent span', async () => {
        await trace
          .getTracer('default')
          .startActiveSpan('root', async rootSpan => {
            const q = new FlowProducer({ connection });
            await q.add({
              name: 'jobName',
              queueName: 'queueName',
              children: [
                {
                  name: 'childJobName',
                  queueName: 'childQueueName',
                },
              ],
            });

            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 3);

            rootSpan.end();
          });
      });

      it('should create a queue span and many job spans for addBulk when there is a parent span', async () => {
        await trace
          .getTracer('default')
          .startActiveSpan('root', async rootSpan => {
            const q = new FlowProducer({ connection });
            await q.addBulk([
              {
                name: 'jobName1',
                queueName: 'queueName',
                data: { test: 'yes' },
              },
              {
                name: 'jobName2',
                queueName: 'queueName',
                data: { test: 'yes' },
              },
            ]);

            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 3);

            rootSpan.end();
          });
      });
    });

    it('should create a queue span and a job span for add', async () => {
      const q = new FlowProducer({ connection });
      await q.add({ name: 'jobName', queueName: 'queueName' });

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      spans.forEach(assertMessagingSystem);

      const flowProducerAddSpan = spans.find(
        span => span.name === 'queueName publish'
      );
      assert.notStrictEqual(flowProducerAddSpan, undefined);
      assertContains(flowProducerAddSpan?.attributes!, {
        'messaging.destination': 'queueName',
        'messaging.bullmq.operation.name': 'FlowProducer.add',
        'messaging.operation': 'publish',
        'messaging.bullmq.job.name': 'jobName',
      });

      const jobAddSpan = spans.find(span => span.name === 'queueName create');
      assert.notStrictEqual(jobAddSpan, undefined);
      assertContains(jobAddSpan?.attributes!, {
        'messaging.destination': 'queueName',
        'messaging.bullmq.operation.name': 'Job.addJob',
        'messaging.operation': 'create',
        'messaging.bullmq.job.name': 'jobName',
      });

      assert.strictEqual(
        typeof jobAddSpan?.attributes!['messaging.message_id'],
        'string'
      );
      assertDoesNotContain(jobAddSpan?.attributes!, [
        'messaging.bullmq.job.parentOpts.parentKey',
        'messaging.bullmq.job.parentOpts.flowChildrenKey',
      ]);

      assertSpanParent(jobAddSpan!, flowProducerAddSpan!);
      assertRootSpan(flowProducerAddSpan!);
    });

    it('should create a queue span and many job spans for add with children', async () => {
      // This configuration option should not affect its behaviour, as this is
      // not a bulk operation, but a flow operation.
      instrumentation.setConfig({ emitCreateSpansForBulk: false });

      const q = new FlowProducer({ connection });
      await q.add({
        name: 'jobName',
        queueName: 'queueName',
        children: [
          {
            name: 'childJobName',
            queueName: 'childQueueName',
          },
        ],
      });

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 3);
      spans.forEach(assertMessagingSystem);

      const flowProducerAddSpan = spans.find(
        span => span.name === 'queueName publish'
      );
      assert.notStrictEqual(flowProducerAddSpan, undefined);
      assert.strictEqual(flowProducerAddSpan?.kind, SpanKind.INTERNAL);
      assertContains(flowProducerAddSpan?.attributes!, {
        'messaging.destination': 'queueName',
        'messaging.bullmq.operation.name': 'FlowProducer.add',
        'messaging.operation': 'publish',
        'messaging.bullmq.job.name': 'jobName',
      });

      const jobAddSpan = spans.find(span => span.name === 'queueName create');
      assert.notStrictEqual(jobAddSpan, undefined);
      assert.strictEqual(jobAddSpan?.kind, SpanKind.PRODUCER);
      assertContains(jobAddSpan?.attributes!, {
        'messaging.destination': 'queueName',
        'messaging.bullmq.operation.name': 'Job.addJob',
        'messaging.operation': 'create',
        'messaging.bullmq.job.name': 'jobName',
        'messaging.bullmq.job.parentOpts.waitChildrenKey':
          'bull:queueName:waiting-children',
      });
      assert.strictEqual(
        typeof jobAddSpan?.attributes!['messaging.message_id'],
        'string'
      );
      assertDoesNotContain(jobAddSpan?.attributes!, [
        'messaging.bullmq.job.parentOpts.parentKey',
      ]);

      const jobId = jobAddSpan?.attributes!['messaging.message_id'] as string;

      const childJobAddSpan = spans.find(
        span => span.name === 'childQueueName create'
      );
      assert.notStrictEqual(childJobAddSpan, undefined);
      assert.strictEqual(childJobAddSpan?.kind, SpanKind.PRODUCER);
      assertContains(childJobAddSpan?.attributes!, {
        'messaging.destination': 'childQueueName',
        'messaging.bullmq.operation.name': 'Job.addJob',
        'messaging.operation': 'create',
        'messaging.bullmq.job.name': 'childJobName',
        'messaging.bullmq.job.opts.parent.id': `${jobId}`,
        // TODO: should this just be `queueName`, without `bull:`?
        // (this seems like a Redis key name)
        'messaging.bullmq.job.opts.parent.queue': 'bull:queueName',
        'messaging.bullmq.job.parentOpts.parentKey': `bull:queueName:${jobId}`,
      });
      assert.strictEqual(
        typeof childJobAddSpan?.attributes!['messaging.message_id'],
        'string'
      );
      assert.notStrictEqual(
        childJobAddSpan?.attributes!['messaging.message_id'],
        'unknown'
      );
      assert.notStrictEqual(
        childJobAddSpan?.attributes!['messaging.message_id'],
        jobId
      );
      assertDoesNotContain(childJobAddSpan?.attributes!, [
        'messaging.bullmq.job.parentOpts.waitChildrenKey',
      ]);

      assertSpanParent(jobAddSpan!, flowProducerAddSpan!);
      assertSpanParent(childJobAddSpan!, flowProducerAddSpan!);
      assertRootSpan(flowProducerAddSpan!);
    });

    it('should not create any job spans for add with children when emitCreateSpansForFlow is false', async () => {
      instrumentation.setConfig({ emitCreateSpansForFlow: false });

      const q = new FlowProducer({ connection });
      await q.add({
        name: 'jobName',
        queueName: 'queueName',
        children: [
          {
            name: 'childJobName',
            queueName: 'childQueueName',
          },
        ],
      });

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      spans.forEach(assertMessagingSystem);

      const flowProducerAddSpan = spans.find(
        span => span.name === 'queueName publish'
      );
      assert.notStrictEqual(flowProducerAddSpan, undefined);
      assert.strictEqual(flowProducerAddSpan?.kind, SpanKind.PRODUCER);
    });

    it('should create a queue span and many job spans for addBulk', async () => {
      const q = new FlowProducer({ connection });
      await q.addBulk([
        { name: 'jobName1', queueName: 'queueName' },
        { name: 'jobName2', queueName: 'queueName' },
      ]);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 3);
      spans.forEach(assertMessagingSystem);

      const flowProducerAddBulkSpan = spans.find(
        span => span.name === '(bulk) publish'
      );
      assert.notStrictEqual(flowProducerAddBulkSpan, undefined);
      assert.strictEqual(flowProducerAddBulkSpan?.kind, SpanKind.INTERNAL);

      assertContains(flowProducerAddBulkSpan?.attributes!, {
        'messaging.bullmq.job.bulk.names': ['jobName1', 'jobName2'],
        'messaging.bullmq.operation.name': 'FlowProducer.addBulk',
        'messaging.operation': 'publish',
        'messaging.bullmq.job.bulk.count': 2,
      });
      assertDoesNotContain(flowProducerAddBulkSpan?.attributes!, [
        'messaging.destination',
        'messaging.bullmq.job.name',
      ]);

      const jobAddSpans = spans.filter(
        span => span.name === 'queueName create'
      );

      for (const jobAddSpan of jobAddSpans) {
        assert.notStrictEqual(jobAddSpan, undefined);
        assert.strictEqual(jobAddSpan?.kind, SpanKind.PRODUCER);
        assertContains(jobAddSpan?.attributes!, {
          'messaging.bullmq.operation.name': 'Job.addJob',
          'messaging.operation': 'create',
        });
        assertSpanParent(jobAddSpan!, flowProducerAddBulkSpan!);
      }

      assertEqualSet(
        jobAddSpans.map(
          jobAddSpan => jobAddSpan.attributes!['messaging.bullmq.job.name']
        ),
        ['jobName1', 'jobName2']
      );

      assertRootSpan(flowProducerAddBulkSpan!);
    });

    for (const [condition, config] of [
      [
        'emitCreateSpansForBulk is false',
        {
          emitCreateSpansForBulk: false,
          emitCreateSpansForFlow: true,
        },
      ],
      [
        'emitCreateSpansForFlow is false',
        {
          emitCreateSpansForBulk: true,
          emitCreateSpansForFlow: false,
        },
      ],
      [
        'both emitCreateSpansForBulk and emitCreateSpansForFlow are false',
        {
          emitCreateSpansForBulk: false,
          emitCreateSpansForFlow: false,
        },
      ],
    ] as [string, BullMQInstrumentationConfig][]) {
      it(`should not create any job spans for addBulk when ${condition}`, async () => {
        instrumentation.setConfig(config);

        const q = new FlowProducer({ connection });
        await q.addBulk([
          { name: 'jobName1', queueName: 'queueName' },
          { name: 'jobName2', queueName: 'queueName' },
        ]);

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        spans.forEach(assertMessagingSystem);

        const flowProducerAddBulkSpan = spans.find(
          span => span.name === '(bulk) publish'
        );
        assert.notStrictEqual(flowProducerAddBulkSpan, undefined);
        assert.strictEqual(flowProducerAddBulkSpan?.kind, SpanKind.PRODUCER);
      });
    }
  });

  describe('Worker', () => {
    it('should not generate any spans when disabled', async () => {
      const [processor, processorDone] = getWait();

      instrumentation.disable();
      const w = new Worker(
        'disabled',
        async () => {
          processorDone();
          return { completed: new Date().toTimeString() };
        },
        { connection }
      );
      await w.waitUntilReady();

      const q = new Queue('disabled', { connection });
      await q.add('testJob', { test: 'yes' });

      await processor;
      await w.close();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 0);
    });

    it('should create a span for the worker run and job attempt', async () => {
      const [processor, processorDone] = getWait();

      const w = new Worker(
        'queueName',
        async () => {
          processorDone();
          return { completed: new Date().toTimeString() };
        },
        { connection }
      );
      await w.waitUntilReady();

      const q = new Queue('queueName', { connection });
      await q.add('testJob', { test: 'yes' });

      await processor;
      await w.close();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      spans.forEach(assertMessagingSystem);

      const queueAddSpan = spans.find(
        span => span.name === 'queueName publish'
      );
      assert.notStrictEqual(queueAddSpan, undefined);

      const workerJobSpan = spans.find(span =>
        span.name.includes('queueName process')
      );
      assert.notStrictEqual(workerJobSpan, undefined);
      assert.strictEqual(workerJobSpan?.kind, SpanKind.CONSUMER);
      assertDifferentTrace(workerJobSpan!, queueAddSpan!);
      assertSpanLink(workerJobSpan!, queueAddSpan!);
      assertContains(workerJobSpan?.attributes!, {
        'messaging.consumer_id': 'queueName',
        'messaging.destination': 'queueName',
        'messaging.message_id': '1',
        'messaging.operation': 'process',
        'messaging.bullmq.operation.name': 'Worker.run',
        'messaging.bullmq.job.name': 'testJob',
        'messaging.bullmq.worker.concurrency': 1,
        'messaging.bullmq.worker.lockDuration': 30000,
        'messaging.bullmq.worker.lockRenewTime': 15000,
      });

      // Attempts start from 0 in BullMQ 5, and from 1 in BullMQ 4 or earlier
      assert.ok(
        (workerJobSpan?.attributes![
          'messaging.bullmq.job.attempts'
        ] as number) < 2
      );
      assert.strictEqual(
        typeof workerJobSpan?.attributes!['messaging.bullmq.job.timestamp'],
        'number'
      );
      assert.strictEqual(
        typeof workerJobSpan?.attributes!['messaging.bullmq.job.processedOn'],
        'number'
      );
      assert.ok(
        workerJobSpan?.attributes!['messaging.bullmq.job.processedOn']! >=
          workerJobSpan?.attributes!['messaging.bullmq.job.timestamp']!
      );

      // no error event
      assert.strictEqual(workerJobSpan?.events.length, 0);
    });

    it('should set the right active context for the job attempt', async () => {
      const [processor, processorDone] = getWait();

      const w = new Worker(
        'queueName',
        async () => {
          trace
            .getTracer('test-tracer')
            .startActiveSpan('inside job', span => span.end());
          processorDone();
          return { completed: new Date().toTimeString() };
        },
        { connection }
      );
      await w.waitUntilReady();

      const q = new Queue('queueName', { connection });
      await q.add('testJob', { test: 'yes' });

      await processor;
      await w.close();

      const spans = memoryExporter.getFinishedSpans();
      const workerJobSpan = spans.find(span =>
        span.name.includes('queueName process')
      );
      assert.notStrictEqual(workerJobSpan, undefined);

      const insideJobSpan = spans.find(span => span.name === 'inside job');
      assert.notStrictEqual(insideJobSpan, undefined);

      assertSpanParent(insideJobSpan!, workerJobSpan!);
    });

    it('should capture errors from the processor', async () => {
      const [processor, processorDone] = getWait();

      const q = new Queue('worker', { connection });
      const w = new Worker(
        'worker',
        async () => {
          processorDone();
          throw new Error('forced error');
        },
        { connection }
      );
      await w.waitUntilReady();

      await q.add('testJob', { started: new Date().toTimeString() });

      await processor;
      await w.close();

      const span = memoryExporter
        .getFinishedSpans()
        .find(span => span.name.includes('worker process'));
      const evt = span?.events.find(event => event.name.includes('exception'));

      assert.notStrictEqual(evt, undefined);
      assert.strictEqual(span?.status.code, SpanStatusCode.ERROR);
      assert.strictEqual(span?.status.message, 'forced error');
    });

    it('should create spans for each job attempt', async () => {
      const [processor, processorDone] = getWait();
      let attemptedOnce = false;

      const q = new Queue('worker', { connection });
      const w = new Worker(
        'worker',
        async () => {
          if (!attemptedOnce) {
            attemptedOnce = true;
            throw new Error('forced error');
          }
          processorDone();
          return { completed: new Date().toTimeString() };
        },
        { connection }
      );
      await w.waitUntilReady();

      await q.add(
        'testJob',
        { started: new Date().toTimeString() },
        { attempts: 3 }
      );

      await processor;
      await w.close();

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 3);
      spans.forEach(assertMessagingSystem);

      const jobSpans = spans.filter(span =>
        span.name.includes('worker process')
      );
      assert.strictEqual(jobSpans.length, 2);
      jobSpans.forEach(span => {
        assert.strictEqual(
          typeof span.attributes['messaging.bullmq.job.attempts'],
          'number'
        );
      });

      jobSpans.sort((a, b) => {
        const aAttempts = a.attributes![
          'messaging.bullmq.job.attempts'
        ] as number;
        const bAttempts = b.attributes![
          'messaging.bullmq.job.attempts'
        ] as number;
        return aAttempts - bAttempts;
      });

      const firstJobSpan = jobSpans[0];
      assert.notStrictEqual(firstJobSpan, undefined);
      assertDoesNotContain(firstJobSpan?.attributes!, [
        'messaging.bullmq.job.failedReason',
      ]);
      assert.strictEqual(firstJobSpan?.events.length, 1);

      const secondJobSpan = jobSpans[1];
      assert.notStrictEqual(secondJobSpan, undefined);
      assertContains(secondJobSpan?.attributes!, {
        'messaging.bullmq.job.failedReason': 'forced error',
      });
      assert.strictEqual(secondJobSpan?.events.length, 0);

      assert.strictEqual(
        (secondJobSpan.attributes!['messaging.bullmq.job.attempts'] as number) -
          (firstJobSpan.attributes!['messaging.bullmq.job.attempts'] as number),
        1
      );
    });
  });
});
