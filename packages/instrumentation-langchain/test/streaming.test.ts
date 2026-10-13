/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import * as assert from 'node:assert/strict';
import {
  context,
  diag,
  DiagLogLevel,
  metrics,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { hrTimeToSeconds, suppressTracing } from '@opentelemetry/core';
import {
  getTestSpans,
  resetMemoryExporter,
  TestMetricReader,
} from '@opentelemetry/contrib-test-utils';
import { DataPointType, MeterProvider } from '@opentelemetry/sdk-metrics';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import {
  RunnableLambda,
  RunnableMap,
  RunnableSequence,
  RunnableWithMessageHistory,
} from '@langchain/core/runnables';
import { AIMessageChunk } from '@langchain/core/messages';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { IterableReadableStream } from '@langchain/core/utils/stream';
import * as sinon from 'sinon';
import { observeIterator } from '../src/streaming';

async function* inputs() {
  yield 'hel';
  yield 'lo';
}

async function collect(iterator: AsyncIterable<unknown>): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of iterator) chunks.push(chunk);
  return chunks;
}

function workflow(kind: 'sequence' | 'map' = 'sequence') {
  const tail = RunnableLambda.from(async function* (value: string) {
    yield value;
    yield '!';
  });
  return kind === 'sequence'
    ? RunnableSequence.from([
        RunnableLambda.from((value: string) => value),
        tail,
      ])
    : RunnableMap.from({ output: tail });
}

describe('LangChain iterator workflows', () => {
  let reader: TestMetricReader;
  let meter: MeterProvider;

  beforeEach(() => {
    reader = new TestMetricReader();
    meter = new MeterProvider({ readers: [reader] });
    instrumentation.setMeterProvider(meter);
    instrumentation.setConfig({ captureMessageContent: 'none' });
    instrumentation.enable();
    resetMemoryExporter();
  });

  afterEach(async () => {
    instrumentation.disable();
    sinon.restore();
    instrumentation.setTracerProvider(trace.getTracerProvider());
    instrumentation.setMeterProvider(metrics.getMeterProvider());
    diag.disable();
    await meter.shutdown();
  });

  async function points() {
    const result = await reader.collect();
    assert.deepEqual(result.errors, []);
    return result.resourceMetrics.scopeMetrics.flatMap(scope =>
      scope.metrics.flatMap(metric => {
        assert.equal(metric.descriptor.name, 'gen_ai.invoke_workflow.duration');
        assert.equal(metric.descriptor.unit, 's');
        assert.equal(metric.dataPointType, DataPointType.HISTOGRAM);
        return metric.dataPointType === DataPointType.HISTOGRAM
          ? metric.dataPoints
          : [];
      })
    );
  }

  for (const kind of ['sequence', 'map'] as const) {
    for (const method of ['stream', 'transform'] as const) {
      for (const capture of ['none', 'span_only'] as const) {
        it(`traces ${kind}.${method} through consumption (capture=${capture})`, async () => {
          instrumentation.setConfig({ captureMessageContent: capture });
          const flow = workflow(kind).withConfig({
            runName: 'configured',
            configurable: { thread_id: 'private-conversation' },
          });
          const options = { runName: 'streaming-workflow' };
          const stream =
            method === 'stream'
              ? await flow.stream('hello', options)
              : flow.transform(inputs(), options);
          assert.equal(getTestSpans().length, 0);
          assert.deepEqual(await points(), []);
          const first = await stream.next();
          assert.deepEqual(
            first.value,
            kind === 'sequence' ? 'hello' : { output: 'hello' }
          );
          assert.equal(getTestSpans().length, 0);
          assert.equal((await stream.next()).done, false);
          assert.equal(getTestSpans().length, 0);
          assert.equal((await stream.next()).done, true);
          const spans = getTestSpans();
          assert.equal(spans.length, 1);
          assert.equal(spans[0].name, 'invoke_workflow streaming-workflow');
          assert.equal(spans[0].kind, SpanKind.INTERNAL);
          assert.equal(spans[0].status.code, SpanStatusCode.UNSET);
          assert.equal(
            spans[0].attributes['gen_ai.operation.name'],
            'invoke_workflow'
          );
          assert.equal(
            spans[0].attributes['gen_ai.conversation.id'],
            'private-conversation'
          );
          if (capture === 'span_only') {
            assert.deepEqual(
              JSON.parse(String(spans[0].attributes['gen_ai.input.messages'])),
              [{ role: 'user', parts: [{ type: 'text', content: 'hello' }] }]
            );
            assert.deepEqual(
              JSON.parse(String(spans[0].attributes['gen_ai.output.messages'])),
              [
                {
                  role: 'assistant',
                  parts: [{ type: 'text', content: 'hello!' }],
                },
              ]
            );
          } else {
            assert.equal(
              spans[0].attributes['gen_ai.input.messages'],
              undefined
            );
            assert.equal(
              spans[0].attributes['gen_ai.output.messages'],
              undefined
            );
          }
          const recorded = await points();
          assert.equal(recorded.length, 1);
          assert.equal(recorded[0].value.count, 1);
          assert.equal(
            recorded[0].value.sum,
            hrTimeToSeconds(spans[0].duration)
          );
          assert.deepEqual(recorded[0].attributes, {
            'gen_ai.workflow.name': 'streaming-workflow',
          });
        });
      }

      it(`ends ${kind}.${method} on early return without recording partial output`, async () => {
        instrumentation.setConfig({ captureMessageContent: 'span_only' });
        const flow = workflow(kind);
        const stream =
          method === 'stream'
            ? await flow.stream('private-input')
            : flow.transform(inputs(), {});
        for await (const chunk of stream) {
          assert.notEqual(chunk, undefined);
          break;
        }
        assert.equal(getTestSpans().length, 1);
        assert.equal(getTestSpans()[0].status.code, SpanStatusCode.UNSET);
        assert.equal(
          getTestSpans()[0].attributes['gen_ai.output.messages'],
          undefined
        );
        assert.equal((await points())[0].value.count, 1);
      });

      it(`respects disabled and suppressed ${kind}.${method}`, async () => {
        const flow = workflow(kind);
        instrumentation.disable();
        await collect(await flow.stream('hello'));
        await collect(flow.transform(inputs(), {}));
        instrumentation.enable();
        const stream = await context.with(
          suppressTracing(context.active()),
          () =>
            method === 'stream'
              ? flow.stream('hello')
              : flow.transform(inputs(), {})
        );
        await collect(stream);
        assert.equal(getTestSpans().length, 0);
        assert.deepEqual(await points(), []);
      });

      for (const stage of ['setup', 'iteration'] as const) {
        it(`preserves ${kind}.${method} ${stage} failures without leaking error content`, async () => {
          instrumentation.setConfig({ captureMessageContent: 'span_only' });
          const failure = new TypeError('private-error-content');
          const tail = RunnableLambda.from(async function* () {
            if (stage === 'iteration') yield 'private-partial-output';
            throw failure;
          });
          const flow =
            kind === 'sequence'
              ? RunnableSequence.from([
                  RunnableLambda.from((value: string) => value),
                  tail,
                ])
              : RunnableMap.from({ output: tail });
          await assert.rejects(
            async () => {
              const stream =
                method === 'stream'
                  ? await flow.stream('input')
                  : flow.transform(inputs(), {});
              await collect(stream);
            },
            error => error === failure
          );
          const spans = getTestSpans();
          assert.equal(spans.length, 1);
          assert.deepEqual(spans[0].status, { code: SpanStatusCode.ERROR });
          assert.equal(spans[0].attributes['error.type'], 'TypeError');
          assert.equal(
            spans[0].attributes['gen_ai.output.messages'],
            undefined
          );
          assert.deepEqual(spans[0].events, []);
          assert.equal(
            JSON.stringify(spans[0].attributes).includes('private-error'),
            false
          );
          const recorded = await points();
          assert.equal(recorded[0].value.count, 1);
          assert.equal(recorded[0].attributes['error.type'], 'TypeError');
        });
      }
    }
  }

  it('keeps transform lazy and does not pull ahead of its caller', async () => {
    let pulls = 0;
    const source = async function* () {
      pulls++;
      yield 'hello';
    };
    const stream = workflow().transform(source(), {});
    assert.equal(pulls, 0);
    assert.equal(getTestSpans().length, 0);
    await stream.return(undefined);
    assert.equal(pulls, 0);
    assert.equal(getTestSpans().length, 0);
    assert.deepEqual(await points(), []);
  });

  it('keeps suppression on nested transforms consumed outside the creation context', async () => {
    const flow = RunnableMap.from({ output: workflow() });
    const stream = context.with(suppressTracing(context.active()), () =>
      flow.transform(inputs(), {})
    );
    await collect(stream);
    assert.equal(getTestSpans().length, 0);
    assert.deepEqual(await points(), []);
  });

  it('accumulates map message lists using the SDK replacement semantics', async () => {
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    const flow = RunnableMap.from({
      messages: RunnableLambda.from(async function* () {
        yield [new AIMessageChunk('first')];
        yield [new AIMessageChunk('last')];
      }),
    });
    await collect(await flow.stream('input'));
    assert.deepEqual(
      JSON.parse(
        String(getTestSpans()[0].attributes['gen_ai.output.messages'])
      ),
      [{ role: 'assistant', parts: [{ type: 'text', content: 'last' }] }]
    );
  });

  it('propagates producer and callback context without leaking it into consumers', async () => {
    const tracer = trace.getTracer('streaming-test');
    const parent = tracer.startSpan('parent');
    const other = tracer.startSpan('consumer');
    const callbackSpans: string[] = [];
    const flow = RunnableSequence.from([
      RunnableLambda.from((value: string) => value),
      RunnableLambda.from(async function* (value: string) {
        tracer.startSpan('first-provider').end();
        yield value;
        await Promise.resolve();
        tracer.startSpan('second-provider').end();
        yield '!';
      }),
    ]);
    const stream = await context.with(
      trace.setSpan(context.active(), parent),
      () =>
        flow.stream('hello', {
          callbacks: [
            {
              handleChainStart() {
                callbackSpans.push(
                  trace.getSpan(context.active())!.spanContext().spanId
                );
              },
            },
          ],
        })
    );
    await context.with(trace.setSpan(context.active(), other), async () => {
      for await (const chunk of stream) {
        assert.notEqual(chunk, undefined);
        assert.equal(trace.getSpan(context.active()), other);
      }
    });
    const spans = getTestSpans();
    const workflowSpan = spans.find(span => span.name === 'invoke_workflow')!;
    assert.equal(
      workflowSpan.parentSpanContext?.spanId,
      parent.spanContext().spanId
    );
    for (const span of spans.filter(span => span.name.endsWith('provider')))
      assert.equal(
        span.parentSpanContext?.spanId,
        workflowSpan.spanContext().spanId
      );
    assert.equal(callbackSpans.length, 3);
    assert.ok(
      callbackSpans.every(id => id === workflowSpan.spanContext().spanId)
    );
    assert.equal(trace.getSpan(context.active()), undefined);
    parent.end();
    other.end();
  });

  it('retains nested workflow spans without duplicating Map.stream delegation', async () => {
    const child = workflow().withConfig({ runName: 'child' });
    const outer = RunnableMap.from({ output: child }).withConfig({
      runName: 'outer',
    });
    await collect(await outer.stream('hello'));
    const spans = getTestSpans();
    assert.deepEqual(spans.map(span => span.name).sort(), [
      'invoke_workflow child',
      'invoke_workflow outer',
    ]);
    const childSpan = spans.find(
      span => span.name === 'invoke_workflow child'
    )!;
    const outerSpan = spans.find(
      span => span.name === 'invoke_workflow outer'
    )!;
    assert.equal(
      childSpan.parentSpanContext?.spanId,
      outerSpan.spanContext().spanId
    );
  });

  for (const method of ['stream', 'transform'] as const) {
    it(`records an abort observed during ${method} consumption`, async () => {
      const controller = new AbortController();
      const failure = new Error('private abort reason');
      failure.name = 'AbortError';
      const options = { signal: controller.signal };
      const flow = workflow();
      const stream =
        method === 'stream'
          ? await flow.stream('hello', options)
          : flow.transform(inputs(), options);
      await stream.next();
      controller.abort(failure);
      await assert.rejects(collect(stream), error => error === failure);
      const span = getTestSpans()[0];
      assert.equal(getTestSpans().length, 1);
      assert.equal(span.status.code, SpanStatusCode.ERROR);
      assert.equal(span.attributes['error.type'], 'AbortError');
      assert.equal((await points())[0].value.count, 1);
    });

    it(`preserves a consumer exception passed to ${method}.throw`, async () => {
      const flow = workflow();
      const stream =
        method === 'stream'
          ? await flow.stream('hello')
          : flow.transform(inputs(), {});
      await stream.next();
      const failure = new Error('private consumer failure');
      await assert.rejects(stream.throw(failure), error => error === failure);
      assert.equal(getTestSpans().length, 1);
      assert.equal(getTestSpans()[0].attributes['error.type'], 'Error');
      assert.equal((await points())[0].value.count, 1);
    });
  }

  it('does not finish a generator when return yields from its finally block', async () => {
    instrumentation.disable();
    const flow = workflow();
    const original = async function* () {
      try {
        yield 'one';
      } finally {
        yield 'cleanup';
      }
    };
    sinon.replace(RunnableSequence.prototype, 'transform', original);
    instrumentation.enable();
    const stream = flow.transform(inputs(), {});
    await stream.next();
    assert.deepEqual(await stream.return(undefined), {
      done: false,
      value: 'cleanup',
    });
    assert.equal(getTestSpans().length, 0);
    assert.equal((await stream.next()).done, true);
    assert.equal(getTestSpans().length, 1);
  });

  it('does not record recovered iterator.throw as a workflow failure', async () => {
    instrumentation.disable();
    const original = async function* () {
      try {
        yield 'one';
      } catch {
        yield 'recovered';
      }
    };
    sinon.replace(RunnableSequence.prototype, 'transform', original);
    instrumentation.enable();
    const stream = workflow().transform(inputs(), {});
    await stream.next();
    assert.deepEqual(await stream.throw(new Error('handled')), {
      done: false,
      value: 'recovered',
    });
    assert.equal(getTestSpans().length, 0);
    await stream.next();
    assert.equal(getTestSpans().length, 1);
    assert.equal(getTestSpans()[0].status.code, SpanStatusCode.UNSET);
  });

  it('keeps recursive streaming invocations distinct', async () => {
    const flow = RunnableMap.from({
      output: RunnableLambda.from(async function* (
        value: number
      ): AsyncGenerator<string> {
        if (value === 0) yield 'done';
        else {
          for await (const chunk of await flow.stream(value - 1))
            yield String(chunk.output);
        }
      }),
    });
    await collect(await flow.stream(1));
    assert.equal(getTestSpans().length, 2);
    assert.equal(
      getTestSpans()[0].parentSpanContext?.spanId,
      getTestSpans()[1].spanContext().spanId
    );
  });

  it('keeps concurrent workflow content isolated', async () => {
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    const flow = workflow();
    await Promise.all(
      ['one', 'two'].map(async input => {
        await collect(await flow.stream(input, { runName: input }));
      })
    );
    assert.equal(getTestSpans().length, 2);
    for (const span of getTestSpans()) {
      const name = span.attributes['gen_ai.workflow.name'];
      assert.deepEqual(
        JSON.parse(String(span.attributes['gen_ai.output.messages'])),
        [
          {
            role: 'assistant',
            parts: [{ type: 'text', content: `${name}!` }],
          },
        ]
      );
    }
  });

  it('finishes nested workflow telemetry when a map iterator is abandoned', async () => {
    const flow = RunnableMap.from({ output: workflow() });
    const stream = await flow.stream('hello');
    for await (const chunk of stream) {
      assert.notEqual(chunk, undefined);
      break;
    }
    assert.equal(getTestSpans().length, 2);
    assert.equal(
      (await points()).reduce((count, point) => count + point.value.count, 0),
      2
    );
  });

  it('does not call message concatenation when capture is disabled', async () => {
    const first = new AIMessageChunk('one');
    const concat = sinon.spy(first, 'concat');
    const flow = RunnableSequence.from([
      RunnableLambda.from((value: string) => value),
      RunnableLambda.from(async function* () {
        yield first;
        yield new AIMessageChunk('two');
      }),
    ]);
    instrumentation.disable();
    await collect(await flow.stream('input'));
    const baseline = concat.callCount;
    concat.resetHistory();
    instrumentation.enable();
    await collect(await flow.stream('input'));
    assert.equal(concat.callCount, baseline);
    assert.equal(
      getTestSpans()[0].attributes['gen_ai.output.messages'],
      undefined
    );
  });

  it('accumulates SDK message chunks and split tool arguments only with capture enabled', async () => {
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    const chunks = [
      new AIMessageChunk({
        content: 'hel',
        tool_call_chunks: [
          { name: 'weather', id: 'call-1', index: 0, args: '{"city":' },
        ],
      }),
      new AIMessageChunk({
        content: 'lo',
        tool_call_chunks: [{ index: 0, args: '"Seattle"}' }],
      }),
    ];
    const flow = RunnableSequence.from([
      RunnableLambda.from((value: string) => value),
      RunnableLambda.from(async function* () {
        yield* chunks;
      }),
    ]);
    const result = await collect(await flow.stream('question'));
    assert.equal(result[0], chunks[0]);
    assert.equal(result[1], chunks[1]);
    const content = JSON.parse(
      String(getTestSpans()[0].attributes['gen_ai.output.messages'])
    );
    assert.deepEqual(content, [
      {
        role: 'assistant',
        parts: [
          { type: 'text', content: 'hello' },
          {
            type: 'tool_call',
            id: 'call-1',
            name: 'weather',
            arguments: { city: 'Seattle' },
          },
        ],
      },
    ]);
    assert.equal(chunks[0].content, 'hel');
  });

  it('keeps started streams on their original providers and capture setting after disable', async () => {
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    const stream = await workflow().stream('hello');
    const exporter = new InMemorySpanExporter();
    const provider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
    });
    const newReader = new TestMetricReader();
    const newMeter = new MeterProvider({ readers: [newReader] });
    try {
      instrumentation.setTracerProvider(provider);
      instrumentation.setMeterProvider(newMeter);
      instrumentation.setConfig({ captureMessageContent: 'none' });
      instrumentation.disable();
      await collect(stream);
      assert.equal(getTestSpans().length, 1);
      assert.ok(getTestSpans()[0].attributes['gen_ai.output.messages']);
      assert.equal(exporter.getFinishedSpans().length, 0);
      assert.equal((await points())[0].value.count, 1);
      assert.equal(
        (await newReader.collect()).resourceMetrics.scopeMetrics.length,
        0
      );
    } finally {
      await provider.shutdown();
      await newMeter.shutdown();
    }
  });

  it('preserves the SDK stream Promise, stream object and iterator Promise identity', async () => {
    instrumentation.disable();
    const original = RunnableSequence.prototype.stream;
    let returned: ReturnType<typeof original> | undefined;
    let resolved: Awaited<ReturnType<typeof original>> | undefined;
    let nextResult: Promise<IteratorResult<unknown>> | undefined;
    sinon.replace(
      RunnableSequence.prototype,
      'stream',
      function (this: RunnableSequence, ...args) {
        returned = original.apply(this, args);
        void returned.then(stream => {
          resolved = stream;
          const next = stream.next;
          stream.next = function (...nextArgs) {
            nextResult = next.apply(this, nextArgs);
            return nextResult;
          };
        });
        return returned;
      }
    );
    instrumentation.enable();
    const promise = workflow().stream('hello');
    assert.equal(promise, returned);
    const stream = await promise;
    assert.equal(stream, resolved);
    assert.ok(stream instanceof IterableReadableStream);
    assert.ok(stream instanceof ReadableStream);
    assert.equal(stream[Symbol.asyncIterator](), stream);
    const next = stream.next();
    assert.equal(next, nextResult);
    await next;
    await collect(stream);
    assert.equal(getTestSpans().length, 1);
  });

  it('does not trace standalone model streams or history adapter workflows', async () => {
    await collect(
      await new FakeListChatModel({ responses: ['hello'] }).stream('question')
    );
    const history = new RunnableWithMessageHistory({
      runnable: RunnableLambda.from(() => new AIMessageChunk('hello')),
      getMessageHistory: () => new InMemoryChatMessageHistory(),
    });
    await collect(
      await history.stream('question', {
        configurable: { sessionId: 'test' },
      })
    );
    assert.equal(getTestSpans().length, 0);
  });

  it('omits unsupported chunk accumulation with content-free diagnostics', async () => {
    const warn = sinon.spy();
    diag.setLogger(
      { warn, error() {}, debug() {}, info() {}, verbose() {} },
      DiagLogLevel.WARN
    );
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    const flow = RunnableSequence.from([
      RunnableLambda.from((value: string) => value),
      RunnableLambda.from(async function* () {
        yield 'private-text';
        yield 42;
      }),
    ]);
    assert.deepEqual(await collect(await flow.stream('input')), [
      'private-text',
      42,
    ]);
    assert.equal(
      getTestSpans()[0].attributes['gen_ai.output.messages'],
      undefined
    );
    assert.ok(warn.called);
    assert.equal(JSON.stringify(warn.args).includes('private-text'), false);
  });

  it('preserves synchronous iterator results, receivers, arguments and descriptors', () => {
    const value = { value: 'chunk' };
    const next = sinon.spy(function (
      this: unknown,
      arg: unknown
    ): { value: string } {
      assert.equal(this, iterator);
      assert.equal(arg, 'argument');
      return value;
    });
    const iterator = { next };
    const descriptor = Object.getOwnPropertyDescriptor(iterator, 'next');
    const observed = sinon.spy();
    const stop = observeIterator(
      iterator,
      (_method, call) => call(),
      observed,
      () => assert.fail(),
      assert.fail,
      diag
    );
    assert.equal(iterator.next('argument'), value);
    assert.equal(observed.firstCall.args[1], value);
    stop();
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(iterator, 'next'),
      descriptor
    );
  });

  it('rolls back iterator observation when a method cannot be wrapped', () => {
    const iterator = {
      next: () => Promise.resolve({ done: false, value: 'chunk' }),
      return: () => Promise.resolve({ done: true, value: undefined }),
    };
    Object.defineProperty(iterator, 'return', {
      configurable: false,
      writable: false,
    });
    const before = Object.getOwnPropertyDescriptors(iterator);
    assert.throws(
      () =>
        observeIterator(
          iterator,
          (_method, call) => call(),
          assert.fail,
          () => assert.fail(),
          assert.fail,
          diag
        ),
      TypeError
    );
    assert.deepEqual(Object.getOwnPropertyDescriptors(iterator), before);
  });

  it('preserves iterator Promises when observation fails and reports the telemetry gap', () => {
    const warn = sinon.spy();
    const logger = { warn, error() {}, info() {}, debug() {}, verbose() {} };
    const promise = Promise.resolve({ done: false, value: 'chunk' });
    Object.defineProperty(promise, 'then', {
      value() {
        throw new Error('private observation failure');
      },
    });
    const iterator = { next: () => promise };
    const original = iterator.next;
    const unobserved = sinon.spy();
    observeIterator(
      iterator,
      (_method, call) => call(),
      assert.fail,
      () => assert.fail(),
      unobserved,
      logger
    );
    assert.equal(iterator.next(), promise);
    assert.equal(iterator.next, original);
    assert.ok(unobserved.calledOnce);
    assert.ok(warn.calledOnce);
    assert.equal(
      JSON.stringify(warn.args).includes('private observation'),
      false
    );
  });

  it('does not read chunk values when capture is disabled', async () => {
    instrumentation.disable();
    const value = sinon.spy(() => 'private chunk');
    const chunk = Object.defineProperty({ done: false }, 'value', {
      get: value,
    });
    const result = Promise.resolve(chunk);
    const original = RunnableSequence.prototype.stream;
    sinon.replace(
      RunnableSequence.prototype,
      'stream',
      function (this: RunnableSequence, ...args) {
        const promise = original.apply(this, args);
        void promise.then(stream => {
          Object.defineProperty(stream, 'next', {
            configurable: true,
            writable: true,
            value: () => result,
          });
        });
        return promise;
      }
    );
    instrumentation.enable();
    const stream = await workflow().stream('input');
    await stream.next();
    await stream.return();
    assert.equal(value.callCount, 0);
    assert.equal(getTestSpans().length, 1);
  });
});
