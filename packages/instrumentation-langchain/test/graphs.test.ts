/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import * as assert from 'node:assert/strict';
import {
  context,
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
import { TracerProvider } from '@opentelemetry/sdk-trace';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { CallbackManager } from '@langchain/core/callbacks/manager';
import { DynamicTool } from '@langchain/core/tools';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { Pregel } from '@langchain/langgraph/pregel';
import * as sinon from 'sinon';
import { FakeChatModel } from '@langchain/core/utils/testing';
import { createAgent } from 'langchain';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

const State = Annotation.Root({
  messages: Annotation<Array<HumanMessage | AIMessage>>,
  privateState: Annotation<string>,
});

function graph(name = 'test_graph') {
  return new StateGraph(State)
    .addNode('respond', async () => ({
      messages: [new AIMessage('graph result')],
    }))
    .addEdge(START, 'respond')
    .addEdge('respond', END)
    .compile({ name });
}

function input() {
  return {
    messages: [new HumanMessage('hello')],
    privateState: 'not message content',
  };
}

describe('LangChain donated graph callbacks', () => {
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
    await meter.shutdown();
  });

  for (const method of ['invoke', 'stream'] as const) {
    for (const capture of ['none', 'span_only'] as const) {
      it(`uses graph start/end callbacks for ${method} (capture=${capture})`, async () => {
        instrumentation.setConfig({ captureMessageContent: capture });
        const operation = graph();
        if (method === 'invoke') {
          const output = await operation.invoke(input(), {
            configurable: { thread_id: 'conversation-1' },
          });
          assert.equal(output.messages[0].content, 'graph result');
        } else {
          const chunks: unknown[] = [];
          for await (const chunk of await operation.stream(input(), {
            configurable: { thread_id: 'conversation-1' },
          }))
            chunks.push(chunk);
          assert.equal(chunks.length, 1);
        }
        const spans = getTestSpans();
        assert.equal(
          spans.length,
          1,
          'only the graph, not internal chain/node spans'
        );
        const [span] = spans;
        assert.equal(span.name, 'invoke_workflow test_graph');
        assert.equal(span.kind, SpanKind.INTERNAL);
        assert.deepEqual(span.status, { code: SpanStatusCode.UNSET });
        assert.equal(span.attributes['gen_ai.workflow.name'], 'test_graph');
        assert.equal(
          span.attributes['gen_ai.conversation.id'],
          'conversation-1'
        );
        assert.equal(
          span.attributes['gen_ai.input.messages'],
          capture === 'span_only'
            ? JSON.stringify([
                { role: 'user', parts: [{ type: 'text', content: 'hello' }] },
              ])
            : undefined
        );
        assert.equal(
          span.attributes['gen_ai.output.messages'],
          capture === 'span_only'
            ? JSON.stringify([
                {
                  role: 'assistant',
                  parts: [{ type: 'text', content: 'graph result' }],
                },
              ])
            : undefined
        );
        assert.ok(
          !JSON.stringify(span.attributes).includes('not message content')
        );
        const collection = await reader.collect();
        const recorded = collection.resourceMetrics.scopeMetrics.flatMap(
          s => s.metrics
        );
        assert.equal(recorded.length, 1);
        assert.equal(
          recorded[0].descriptor.name,
          'gen_ai.invoke_workflow.duration'
        );
        assert.ok(recorded[0].dataPointType === DataPointType.HISTOGRAM);
        assert.equal(recorded[0].dataPoints[0].value.count, 1);
        assert.equal(
          recorded[0].dataPoints[0].value.sum,
          hrTimeToSeconds(span.duration)
        );
        assert.deepEqual(recorded[0].dataPoints[0].attributes, {
          'gen_ai.workflow.name': 'test_graph',
        });
      });
    }
  }

  it('uses explicit run names and preserves user callbacks and manager state', async () => {
    const events: string[] = [];
    const callbacks = CallbackManager.fromHandlers({
      handleChainStart(
        _chain,
        _inputs,
        _id,
        _parent,
        _tags,
        _metadata,
        _type,
        name
      ) {
        events.push(`start:${name}`);
      },
      handleChainEnd() {
        events.push('end');
      },
    });
    const handlers = [...callbacks.handlers];
    await graph()
      .withConfig({ callbacks, runName: 'configured' })
      .invoke(input(), { runName: 'request' });
    assert.equal(getTestSpans()[0].name, 'invoke_workflow request');
    assert.ok(events.includes('start:request'));
    assert.ok(events.includes('end'));
    assert.deepEqual(callbacks.handlers, handlers);
  });

  it('parents subgraphs, tool executions and application spans to the graph', async () => {
    const child = graph('child');
    const tool = new DynamicTool({
      name: 'echo',
      description: 'Offline tool',
      func: async value => {
        const span = trace.getTracer('graph-test').startSpan('inside-tool');
        span.end();
        return value;
      },
    });
    const parent = new StateGraph(State)
      .addNode('child', child)
      .addNode('tool', async state => {
        await Promise.resolve();
        const span = trace.getTracer('graph-test').startSpan('inside-node');
        span.end();
        await tool.invoke('hello');
        return state;
      })
      .addEdge(START, 'child')
      .addEdge('child', 'tool')
      .addEdge('tool', END)
      .compile({ name: 'parent' });
    await parent.invoke(input());
    const spans = getTestSpans();
    assert.equal(spans.length, 5);
    const byName = new Map(spans.map(span => [span.name, span]));
    const parentSpan = byName.get('invoke_workflow parent');
    const childSpan = byName.get('invoke_workflow child');
    const toolSpan = byName.get('execute_tool echo');
    assert.ok(parentSpan && childSpan && toolSpan);
    assert.equal(
      childSpan.parentSpanContext?.spanId,
      parentSpan.spanContext().spanId
    );
    assert.equal(
      toolSpan.parentSpanContext?.spanId,
      parentSpan.spanContext().spanId
    );
    assert.equal(
      byName.get('inside-node')?.parentSpanContext?.spanId,
      parentSpan.spanContext().spanId
    );
    assert.equal(
      byName.get('inside-tool')?.parentSpanContext?.spanId,
      toolSpan.spanContext().spanId
    );
  });

  for (const boundary of [
    'sequence',
    'sequence with callbacks',
    'tool',
    'application',
  ] as const) {
    it(`keeps the active ${boundary} as a nested graph's immediate parent`, async () => {
      const child = graph('child');
      const sequence = RunnableSequence.from([
        RunnableLambda.from((state: typeof State.State, config) =>
          child.invoke(
            state,
            boundary === 'sequence with callbacks' ? config : undefined
          )
        ),
        RunnableLambda.from((state: typeof State.State) => state),
      ]).withConfig({ runName: 'middle' });
      const tool = new DynamicTool({
        name: 'middle',
        description: 'Offline graph tool',
        func: async () => {
          await child.invoke(input());
          return 'done';
        },
      });
      const parent = new StateGraph(State)
        .addNode('step', async state => {
          await Promise.resolve();
          if (boundary === 'tool') {
            await tool.invoke('hello');
            return state;
          }
          if (boundary === 'application') {
            return trace
              .getTracer('graph-test')
              .startActiveSpan('application', async span => {
                try {
                  return await child.invoke(state);
                } finally {
                  span.end();
                }
              });
          }
          return sequence.invoke(state);
        })
        .addEdge(START, 'step')
        .addEdge('step', END)
        .compile({ name: 'parent' });
      await parent.invoke(input());
      const spans = getTestSpans();
      assert.equal(spans.length, 3);
      const parentSpan = spans.find(
        span => span.name === 'invoke_workflow parent'
      );
      const childSpan = spans.find(
        span => span.name === 'invoke_workflow child'
      );
      const middleSpan = spans.find(
        span => span !== parentSpan && span !== childSpan
      );
      assert.ok(parentSpan && childSpan && middleSpan);
      assert.equal(
        middleSpan.parentSpanContext?.spanId,
        parentSpan.spanContext().spanId
      );
      assert.equal(
        childSpan.parentSpanContext?.spanId,
        middleSpan.spanContext().spanId
      );
    });
  }

  for (const method of ['invoke', 'stream'] as const) {
    it(`records callback failures and preserves the SDK error for ${method}`, async () => {
      const failure = new TypeError('private graph failure');
      const operation = new StateGraph(State)
        .addNode('fail', () => {
          throw failure;
        })
        .addEdge(START, 'fail')
        .addEdge('fail', END)
        .compile({ name: 'failure' });
      await assert.rejects(
        async () => {
          if (method === 'invoke') await operation.invoke(input());
          else
            for await (const chunk of await operation.stream(input())) {
              assert.ok(chunk);
            }
        },
        error => error === failure
      );
      const spans = getTestSpans();
      assert.equal(spans.length, 1);
      assert.deepEqual(spans[0].status, { code: SpanStatusCode.ERROR });
      assert.equal(spans[0].attributes['error.type'], 'TypeError');
      assert.deepEqual(spans[0].events, []);
      assert.ok(!JSON.stringify(spans[0].attributes).includes(failure.message));
    });
  }

  it('does not emit graph telemetry when disabled or suppressed', async () => {
    instrumentation.disable();
    await graph().invoke(input());
    assert.deepEqual(getTestSpans(), []);
    instrumentation.enable();
    await context.with(suppressTracing(context.active()), () =>
      graph().invoke(input())
    );
    assert.deepEqual(getTestSpans(), []);
  });

  it('leaves standalone runnable and existing composed workflow boundaries unchanged', async () => {
    await RunnableLambda.from(value => value).invoke('hello');
    assert.deepEqual(getTestSpans(), []);
    await RunnableSequence.from([
      RunnableLambda.from(value => value),
      RunnableLambda.from(value => value),
    ]).invoke('hello');
    assert.equal(getTestSpans().length, 1);
  });

  it('keeps overlapping invocations with the same SDK run ID independent', async () => {
    const operation = graph();
    await Promise.all([
      operation.invoke(input(), {
        runId: '11111111-1111-4111-8111-111111111111',
        runName: 'first',
      }),
      operation.invoke(input(), {
        runId: '11111111-1111-4111-8111-111111111111',
        runName: 'second',
      }),
    ]);
    assert.deepEqual(
      getTestSpans()
        .map(span => span.name)
        .sort(),
      ['invoke_workflow first', 'invoke_workflow second']
    );
  });

  it('observes event streaming without duplicate workflow spans', async () => {
    const events: unknown[] = [];
    for await (const event of graph().streamEvents(input(), { version: 'v2' }))
      events.push(event);
    assert.ok(events.length > 0);
    assert.equal(getTestSpans().length, 1);
    assert.equal(getTestSpans()[0].name, 'invoke_workflow test_graph');
  });

  for (const version of ['v1', 'v2'] as const) {
    for (const shape of ['array', 'manager'] as const) {
      for (const fails of [false, true]) {
        it(`preserves configured ${shape} callbacks and completes every span for streamEvents ${version} (fails=${fails})`, async () => {
          const events: string[] = [];
          const callbacks = CallbackManager.fromHandlers({
            handleChainStart(
              _chain,
              _input,
              _id,
              _parent,
              _tags,
              _metadata,
              _type,
              name
            ) {
              events.push(`start:${name}`);
            },
            handleChainEnd() {
              events.push('end');
            },
            handleChainError() {
              events.push('error');
            },
          });
          const handlers = [...callbacks.handlers];
          const inheritableHandlers = [...callbacks.inheritableHandlers];
          const failure = new TypeError('synthetic graph failure');
          const operation = new StateGraph(State)
            .addNode('step', state => {
              if (fails) throw failure;
              return state;
            })
            .addEdge(START, 'step')
            .addEdge('step', END)
            .compile({ name: 'configured' })
            .withConfig({
              callbacks: shape === 'array' ? callbacks.handlers : callbacks,
            });
          const onStart = sinon.spy();
          const onEnd = sinon.spy();
          const provider = new TracerProvider({
            spanProcessors: [
              {
                onStart,
                onEnd,
                forceFlush: async () => {},
                shutdown: async () => {},
              },
            ],
          });
          instrumentation.setTracerProvider(provider);
          const consume = async () => {
            for await (const event of operation.streamEvents(input(), {
              version,
            })) {
              assert.ok(event);
            }
          };
          const run = async () => {
            if (fails)
              await assert.rejects(consume, error => error === failure);
            else await consume();
          };
          try {
            instrumentation.disable();
            await run();
            const baseline = [...events];
            events.length = 0;
            instrumentation.enable();
            await run();
            assert.deepEqual(events, baseline);
            assert.deepEqual(callbacks.handlers, handlers);
            assert.deepEqual(
              callbacks.inheritableHandlers,
              inheritableHandlers
            );
            assert.equal(onStart.callCount, 1);
            assert.equal(onEnd.callCount, 1);
            assert.equal(onStart.firstCall.args[0], onEnd.firstCall.args[0]);
          } finally {
            await provider.shutdown();
          }
        });
      }
    }
  }

  it('preserves the stream Promise and the SDK stream object', async () => {
    instrumentation.disable();
    const original = sinon.spy(Pregel.prototype, 'stream');
    instrumentation.enable();
    const result = graph().stream(input());
    assert.equal(result, original.returnValues[0]);
    const stream = await result;
    assert.equal(stream, await original.returnValues[0]);
    for await (const chunk of stream) {
      assert.ok(chunk);
    }
    assert.equal(getTestSpans().length, 1);
  });

  it('records one graph invocation per batch input', async () => {
    const results = await graph().batch([input(), input()]);
    assert.equal(results.length, 2);
    assert.equal(getTestSpans().length, 2);
  });

  it('finishes an active run after configuration changes and disablement', async () => {
    const operation = new StateGraph(State)
      .addNode('step', () => {
        instrumentation.setConfig({ captureMessageContent: 'none' });
        instrumentation.disable();
        return { messages: [new AIMessage('finished')] };
      })
      .addEdge(START, 'step')
      .addEdge('step', END)
      .compile({ name: 'inflight' });
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    await operation.invoke(input());
    const spans = getTestSpans();
    assert.equal(spans.length, 1);
    assert.equal(spans[0].name, 'invoke_workflow inflight');
    assert.ok(spans[0].attributes['gen_ai.input.messages']);
    assert.ok(spans[0].attributes['gen_ai.output.messages']);
  });

  it('retains inherited user callbacks for recursive calls to the same graph', async () => {
    const names: string[] = [];
    const step = async (
      state: typeof State.State
    ): Promise<typeof State.State> => {
      if (state.privateState === 'nested') return state;
      return operation.invoke(
        { ...state, privateState: 'nested' },
        { runName: 'inner' }
      );
    };
    const operation = new StateGraph(State)
      .addNode('step', step)
      .addEdge(START, 'step')
      .addEdge('step', END)
      .compile({ name: 'outer' });
    await operation.invoke(input(), {
      callbacks: [
        {
          handleChainStart(
            _chain,
            _input,
            _id,
            _parent,
            _tags,
            _metadata,
            _type,
            name
          ) {
            if (name) names.push(name);
          },
        },
      ],
    });
    assert.ok(names.includes('inner'));
    const spans = getTestSpans();
    assert.equal(spans.length, 2);
    const outer = spans.find(span => span.name === 'invoke_workflow outer');
    const inner = spans.find(span => span.name === 'invoke_workflow inner');
    assert.ok(outer && inner);
    assert.equal(inner.parentSpanContext?.spanId, outer.spanContext().spanId);
  });

  it('does not synthesize a completion when stream consumption stops early', async () => {
    let graphRun: string | undefined;
    let completions = 0;
    const callbacks = {
      handleChainStart(
        _chain: unknown,
        _input: unknown,
        id: string,
        _parent: unknown,
        _tags: unknown,
        _metadata: unknown,
        _type: unknown,
        name?: string
      ) {
        if (name === 'early') graphRun = id;
      },
      handleChainEnd(_output: unknown, id: string) {
        if (id === graphRun) completions++;
      },
      handleChainError(_error: unknown, id: string) {
        if (id === graphRun) completions++;
      },
    };
    const stream = await graph('early').stream(input(), {
      callbacks: [callbacks],
    });
    for await (const chunk of stream) {
      assert.ok(chunk);
      break;
    }
    assert.equal(getTestSpans().length, completions);
  });

  it('leaves accessor-backed callback configuration to the SDK', async () => {
    let reads = 0;
    let starts = 0;
    const callbacks = [
      {
        handleChainStart() {
          starts++;
        },
      },
    ];
    const options = {
      get callbacks() {
        reads++;
        return callbacks;
      },
    };
    const operation = graph();
    const consume = async () => {
      for await (const chunk of await operation.stream(input(), options))
        assert.ok(chunk);
    };
    instrumentation.disable();
    await consume();
    const baseline = { reads, starts };
    reads = starts = 0;
    instrumentation.enable();
    await consume();
    assert.deepEqual({ reads, starts }, baseline);
    assert.deepEqual(getTestSpans(), []);
  });

  it('does not make a validation failure into a successful operation', async () => {
    await assert.rejects(
      graph().invoke(input(), { recursionLimit: 0 }),
      /recursionLimit/
    );
    assert.deepEqual(getTestSpans(), []);
  });

  it('does not create workflow-name dimensions from the SDK class name', async () => {
    const unnamed = new StateGraph(State)
      .addNode('step', state => state)
      .addEdge(START, 'step')
      .addEdge('step', END)
      .compile();
    await unnamed.invoke(input());
    assert.equal(getTestSpans()[0].name, 'invoke_workflow');
    assert.equal(
      getTestSpans()[0].attributes['gen_ai.workflow.name'],
      undefined
    );
  });

  it('does not relabel an agent internal graph as a workflow', async () => {
    class Model extends FakeChatModel {
      override bindTools() {
        return this;
      }
    }
    const agent = createAgent({ model: new Model({}), tools: [] });
    await agent.invoke({ messages: [new HumanMessage('hello')] });
    assert.deepEqual(getTestSpans(), []);
    if ('withConfig' in agent && typeof agent.withConfig === 'function') {
      await agent.withConfig({ runName: 'renamed-agent' }).invoke({
        messages: [new HumanMessage('hello')],
      });
      assert.deepEqual(getTestSpans(), []);
    }
  });

  it('preserves callback behavior when graph tracing is enabled', async () => {
    const operation = graph();
    const capture = async (enabled: boolean) => {
      if (enabled) instrumentation.enable();
      else instrumentation.disable();
      const events: unknown[] = [];
      await operation.invoke(input(), {
        callbacks: [
          {
            handleChainStart(
              _chain,
              _input,
              _runId,
              _parent,
              tags,
              metadata,
              _type,
              name
            ) {
              const stableMetadata = { ...metadata };
              // These namespaces contain a different generated task ID on each run.
              delete stableMetadata.checkpoint_ns;
              delete stableMetadata.langgraph_checkpoint_ns;
              delete stableMetadata.__pregel_task_id;
              events.push({ name, tags, metadata: stableMetadata });
            },
            handleChainEnd(output) {
              events.push(output);
            },
          },
        ],
      });
      return events;
    };
    const without = await capture(false);
    const withInstrumentation = await capture(true);
    assert.deepEqual(withInstrumentation, without);
  });

  it('does not serialize arbitrary graph state as messages', async () => {
    const Counter = Annotation.Root({
      count: Annotation<number>,
      secret: Annotation<string>,
    });
    const operation = new StateGraph(Counter)
      .addNode('step', state => ({ count: state.count + 1 }))
      .addEdge(START, 'step')
      .addEdge('step', END)
      .compile({ name: 'counter' });
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    assert.deepEqual(await operation.invoke({ count: 1, secret: 'private' }), {
      count: 2,
      secret: 'private',
    });
    const [span] = getTestSpans();
    assert.equal(span.attributes['gen_ai.input.messages'], undefined);
    assert.equal(span.attributes['gen_ai.output.messages'], undefined);
  });

  it('preserves explicit graph/tool parentage without a context manager', async () => {
    const tool = new DynamicTool({
      name: 'without-context-manager',
      description: 'Offline tool',
      func: async (value, runManager) => {
        await graph('inside-tool').invoke(input(), {
          callbacks: runManager?.getChild(),
        });
        return value;
      },
    });
    const operation = new StateGraph(State)
      .addNode('step', async state => {
        await tool.invoke('hello');
        return state;
      })
      .addEdge(START, 'step')
      .addEdge('step', END)
      .compile({ name: 'parent' });
    context.disable();
    try {
      await operation.invoke(input());
      const spans = getTestSpans();
      const parent = spans.find(span => span.name === 'invoke_workflow parent');
      const child = spans.find(
        span => span.name === 'execute_tool without-context-manager'
      );
      assert.ok(parent && child);
      assert.equal(
        child.parentSpanContext?.spanId,
        parent.spanContext().spanId
      );
      const nested = spans.find(
        span => span.name === 'invoke_workflow inside-tool'
      );
      assert.ok(nested);
      assert.equal(
        nested.parentSpanContext?.spanId,
        child.spanContext().spanId
      );
    } finally {
      context.setGlobalContextManager(
        new AsyncLocalStorageContextManager().enable()
      );
    }
  });
});
