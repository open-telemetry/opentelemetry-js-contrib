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
import {
  InMemorySpanExporter,
  SamplingDecision,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import {
  Annotation,
  Command,
  interrupt,
  MemorySaver,
  StateGraph,
  START,
  END,
} from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
} from '@langchain/core/messages';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { CallbackManager } from '@langchain/core/callbacks/manager';
import { DynamicTool } from '@langchain/core/tools';
import {
  Runnable,
  RunnableLambda,
  RunnableSequence,
  type RunnableConfig,
} from '@langchain/core/runnables';
import { Pregel } from '@langchain/langgraph/pregel';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import * as sinon from 'sinon';
import { FakeChatModel } from '@langchain/core/utils/testing';
import { createAgent } from 'langchain';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import * as content from '../src/content';

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
        assert.equal(
          span.attributes['gen_ai.operation.name'],
          'invoke_workflow'
        );
        assert.equal(span.attributes['gen_ai.agent.name'], 'test_graph');
        assert.equal(span.attributes['gen_ai.workflow.name'], undefined);
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
          'gen_ai.invoke_agent.duration'
        );
        assert.ok(recorded[0].dataPointType === DataPointType.HISTOGRAM);
        assert.equal(recorded[0].dataPoints[0].value.count, 1);
        assert.equal(
          recorded[0].dataPoints[0].value.sum,
          hrTimeToSeconds(span.duration)
        );
        assert.deepEqual(recorded[0].dataPoints[0].attributes, {
          'gen_ai.operation.name': 'invoke_workflow',
          'gen_ai.agent.name': 'test_graph',
        });
      });
    }
  }

  for (const capture of ['none', 'span_only'] as const) {
    for (const fails of [false, true]) {
      it(`captures original graph input once at span start (capture=${capture}, fails=${fails})`, async () => {
        const shouldSample = sinon.stub().returns({
          decision: SamplingDecision.RECORD_AND_SAMPLED,
        });
        const exporter = new InMemorySpanExporter();
        const provider = new TracerProvider({
          sampler: { shouldSample, toString: () => 'graph-input-sampler' },
          spanProcessors: [new SimpleSpanProcessor({ exporter })],
        });
        const serialize = sinon.spy(content, 'messages');
        const payload = input();
        const failure = new TypeError('synthetic failure');
        const operation = new StateGraph(State)
          .addNode('step', state => {
            state.messages[0].content = 'changed during execution';
            if (fails) throw failure;
            return { messages: [new AIMessage('result')] };
          })
          .addEdge(START, 'step')
          .addEdge('step', END)
          .compile({ name: 'input-snapshot' });
        instrumentation.setTracerProvider(provider);
        instrumentation.setConfig({ captureMessageContent: capture });
        try {
          if (fails) {
            await assert.rejects(
              operation.invoke(payload),
              error => error === failure
            );
          } else {
            await operation.invoke(payload);
          }
          assert.equal(payload.messages[0].content, 'changed during execution');
          const expected =
            capture === 'span_only'
              ? JSON.stringify([
                  { role: 'user', parts: [{ type: 'text', content: 'hello' }] },
                ])
              : undefined;
          const spans = exporter.getFinishedSpans();
          assert.equal(spans.length, 1);
          assert.equal(spans[0].attributes['gen_ai.input.messages'], expected);
          assert.equal(shouldSample.callCount, 1);
          assert.equal(
            shouldSample.firstCall.args[4]['gen_ai.input.messages'],
            expected
          );
          assert.equal(
            serialize.getCalls().filter(call => call.args[0] === payload)
              .length,
            capture === 'span_only' ? 1 : 0
          );
        } finally {
          instrumentation.setTracerProvider(trace.getTracerProvider());
          await provider.shutdown();
        }
      });
    }
  }

  it('uses effective graph configurable before callback metadata for conversation IDs', async () => {
    const defaults: RunnableConfig = {
      configurable: { thread_id: 'default-thread' },
      metadata: { thread_id: 'default-metadata-thread' },
    };
    const cases: RunnableConfig[] = [
      { metadata: { session_id: 'request-metadata' } },
      {
        configurable: { thread_id: 'request-thread' },
        metadata: {
          session_id: 'request-metadata',
          thread_id: 'metadata-thread',
        },
      },
      {
        configurable: { session_id: 'request-session' },
        metadata: { session_id: 'request-metadata' },
      },
      {
        configurable: { conversation_id: 'request-conversation' },
        metadata: { session_id: 'request-metadata' },
      },
      { configurable: {}, metadata: { session_id: 'request-metadata' } },
      {
        configurable: { thread_id: '', session_id: 'request-session' },
        metadata: { session_id: 'request-metadata' },
      },
    ];
    for (const options of cases) {
      let received: RunnableConfig | undefined;
      const operation = new StateGraph(State)
        .addNode('step', (state, config) => {
          received = config;
          return state;
        })
        .addEdge(START, 'step')
        .addEdge('step', END)
        .compile()
        .withConfig(defaults);
      await operation.invoke(input(), options);
      assert.ok(received);
      const expected = [
        received.configurable?.thread_id,
        received.configurable?.session_id,
        received.configurable?.conversation_id,
        received.metadata?.session_id,
        received.metadata?.thread_id,
        received.metadata?.conversation_id,
      ].find(value => typeof value === 'string' && value.length > 0);
      assert.ok(expected);
      assert.equal(
        getTestSpans().at(-1)?.attributes['gen_ai.conversation.id'],
        expected
      );
    }
    const manager = CallbackManager.fromHandlers({});
    manager.addMetadata({ session_id: 'manager-session' });
    await graph().invoke(input(), { callbacks: manager });
    assert.equal(
      getTestSpans().at(-1)?.attributes['gen_ai.conversation.id'],
      'manager-session'
    );
  });

  for (const source of ['call', 'withConfig'] as const) {
    for (const shape of ['array', 'manager'] as const) {
      it(`retains inherited graph context with ${source} ${shape} callbacks without changing SDK notifications`, async () => {
        // Exercise the callback-only parentage path, not active OTel context.
        context.disable();
        const observe = async (enabled: boolean) => {
          if (enabled) instrumentation.enable();
          else instrumentation.disable();
          resetMemoryExporter();
          const events: string[] = [];
          let childThread: unknown;
          const childCallbacks = CallbackManager.fromHandlers({
            handleChainStart(_s, _i, _id, _parent, _tags, _meta, _type, name) {
              events.push(`child:${name}`);
            },
          });
          const handlers = [...childCallbacks.handlers];
          const inheritable = [...childCallbacks.inheritableHandlers];
          const config: RunnableConfig = {
            callbacks: shape === 'array' ? handlers : childCallbacks,
            metadata: { session_id: 'child-metadata' },
          };
          if (source === 'withConfig')
            config.configurable = { thread_id: 'child-default' };
          const childGraph = new StateGraph(State)
            .addNode('step', (state, config) => {
              childThread = config.configurable?.thread_id;
              return state;
            })
            .addEdge(START, 'step')
            .addEdge('step', END)
            .compile({ name: 'child' });
          const child =
            source === 'withConfig'
              ? childGraph.withConfig(config)
              : childGraph;
          const parent = new StateGraph(State)
            .addNode('step', state =>
              child.invoke(state, source === 'call' ? config : undefined)
            )
            .addEdge(START, 'step')
            .addEdge('step', END)
            .compile({ name: 'parent' });
          await parent.invoke(input(), {
            configurable: { thread_id: 'parent-thread' },
            callbacks: [
              {
                handleChainStart(
                  _s,
                  _i,
                  _id,
                  _parent,
                  _tags,
                  _meta,
                  _type,
                  name
                ) {
                  events.push(`parent:${name}`);
                },
              },
            ],
          });
          assert.deepEqual(childCallbacks.handlers, handlers);
          assert.deepEqual(childCallbacks.inheritableHandlers, inheritable);
          return { events, childThread };
        };
        try {
          const baseline = await observe(false);
          assert.deepEqual(await observe(true), baseline);
          assert.ok(baseline.events.some(event => event.endsWith(':child')));
          const spans = getTestSpans();
          assert.equal(spans.length, 2);
          const parent = spans.find(
            span => span.name === 'invoke_workflow parent'
          )!;
          const child = spans.find(
            span => span.name === 'invoke_workflow child'
          )!;
          assert.equal(
            child.parentSpanContext?.spanId,
            parent.spanContext().spanId
          );
          assert.equal(
            child.attributes['gen_ai.conversation.id'],
            baseline.childThread
          );
        } finally {
          context.setGlobalContextManager(
            new AsyncLocalStorageContextManager().enable()
          );
          instrumentation.enable();
        }
      });
    }
  }

  it('traces piped graph streaming through the same normalized callbacks', async () => {
    const operation = graph().pipe(RunnableLambda.from(value => value));
    const chunks: unknown[] = [];
    for await (const chunk of await operation.stream(input()))
      chunks.push(chunk);
    assert.equal(chunks.length, 1);
    const spans = getTestSpans();
    assert.equal(spans.length, 1);
    assert.equal(spans[0].name, 'invoke_workflow test_graph');
    const collection = await reader.collect();
    const recorded = collection.resourceMetrics.scopeMetrics.flatMap(
      scope => scope.metrics
    );
    assert.equal(recorded.length, 1);
    assert.ok(recorded[0].dataPointType === DataPointType.HISTOGRAM);
    assert.equal(recorded[0].dataPoints[0].value.count, 1);
    assert.equal(
      recorded[0].dataPoints[0].value.sum,
      hrTimeToSeconds(spans[0].duration)
    );
  });

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

  for (const kind of ['callable', 'sequence', 'internal-sequence'] as const) {
    it(`preserves intermediate parents inside graph nodes (${kind})`, async () => {
      const tracer = trace.getTracer('graph-test');
      const tool = new DynamicTool({
        name: 'echo',
        description: 'Offline tool',
        func: async value => {
          await Promise.resolve();
          tracer.startSpan('inside-tool').end();
          return value;
        },
      });
      const toolNode = new ToolNode([tool], { handleToolErrors: false });
      const sequence = RunnableSequence.from([
        RunnableLambda.from(value => value),
        toolNode,
      ]);
      sequence.omitSequenceTags = kind === 'internal-sequence';
      const operation = new StateGraph(State)
        .addNode('step', async (state, config) =>
          tracer.startActiveSpan('intermediate', async span => {
            try {
              await Promise.resolve();
              const request = {
                messages: [
                  new AIMessage({
                    content: '',
                    tool_calls: [
                      { name: 'echo', args: { input: 'hello' }, id: 'call-1' },
                    ],
                  }),
                ],
              };
              await (kind === 'callable' ? toolNode : sequence).invoke(
                request,
                kind === 'callable' ? config : { ...config, runName: 'nested' }
              );
              assert.equal(trace.getSpan(context.active()), span);
              return state;
            } finally {
              span.end();
            }
          })
        )
        .addEdge(START, 'step')
        .addEdge('step', END)
        .compile({ name: 'parent' });
      await tracer.startActiveSpan('request', async span => {
        try {
          await operation.invoke(input());
          assert.equal(trace.getSpan(context.active()), span);
        } finally {
          span.end();
        }
      });
      const spans = getTestSpans();
      const expected = [
        'request',
        'invoke_workflow parent',
        'intermediate',
        ...(kind === 'sequence' ? ['invoke_workflow nested'] : []),
        'execute_tool echo',
        'inside-tool',
      ];
      assert.deepEqual(
        spans.map(span => span.name).sort(),
        [...expected].sort()
      );
      for (let i = 1; i < expected.length; i++) {
        const parent = spans.find(span => span.name === expected[i - 1]);
        const child = spans.find(span => span.name === expected[i]);
        assert.ok(parent && child);
        assert.equal(
          child.parentSpanContext?.spanId,
          parent.spanContext().spanId,
          `${child.name} should remain a child of ${parent.name}`
        );
      }
      assert.equal(trace.getSpan(context.active()), undefined);
    });
  }

  for (const method of ['invoke', 'stream'] as const) {
    for (const signal of ['interrupt', 'parent command'] as const) {
      it(`completes nested graph ${signal} callbacks without failures for ${method}`, async () => {
        instrumentation.setConfig({ captureMessageContent: 'span_only' });
        const onError = sinon.spy();
        const child = new StateGraph(State)
          .addNode('signal', () => {
            if (signal === 'parent command')
              return new Command({
                graph: Command.PARENT,
                goto: 'done',
                update: { messages: [new AIMessage('redirected')] },
              });
            return {
              messages: [new AIMessage(interrupt<string>('approval needed'))],
            };
          })
          .addEdge(START, 'signal')
          .addEdge('signal', END)
          .compile({ name: 'child' });
        const operation = new StateGraph(State)
          .addNode('child', child, { ends: ['done'] })
          .addNode('done', state => state)
          .addEdge(START, 'child')
          .addEdge('child', 'done')
          .addEdge('done', END)
          .compile({ name: 'parent', checkpointer: new MemorySaver() });
        const config = {
          configurable: { thread_id: 'control-flow' },
          callbacks: [{ handleChainError: onError }],
        };
        const run = async (value: Parameters<typeof operation.invoke>[0]) => {
          if (method === 'invoke') return operation.invoke(value, config);
          let output;
          for await (const chunk of await operation.stream(value, {
            ...config,
            streamMode: 'values',
          }))
            output = chunk;
          return output;
        };
        let output = await run(input());
        assert.ok(
          onError.getCalls().some(call => {
            const error = call.args[0];
            return (
              error.name ===
                (signal === 'interrupt' ? 'GraphInterrupt' : 'ParentCommand') &&
              error.is_bubble_up === true
            );
          }),
          'the SDK must deliver the control-flow signal to user callbacks'
        );
        assert.equal(getTestSpans().length, 2);
        const childSpan = getTestSpans().find(
          span => span.name === 'invoke_workflow child'
        );
        assert.ok(childSpan);
        assert.equal(childSpan.attributes['gen_ai.output.messages'], undefined);
        if (signal === 'interrupt')
          output = await run(new Command({ resume: 'approved' }));
        assert.deepEqual(output, {
          messages: [
            new AIMessage(signal === 'interrupt' ? 'approved' : 'redirected'),
          ],
          privateState: 'not message content',
        });
        const count = signal === 'interrupt' ? 2 : 1;
        const spans = getTestSpans();
        assert.equal(spans.length, 2 * count);
        for (const span of spans) {
          assert.deepEqual(span.status, { code: SpanStatusCode.UNSET });
          assert.equal(span.attributes['error.type'], undefined);
          assert.deepEqual(span.events, []);
        }
        const result = await reader.collect();
        const recorded = result.resourceMetrics.scopeMetrics.flatMap(
          scope => scope.metrics
        );
        assert.equal(recorded.length, 1);
        assert.equal(
          recorded[0].descriptor.name,
          'gen_ai.invoke_agent.duration'
        );
        const histogram = recorded[0];
        assert.ok(histogram.dataPointType === DataPointType.HISTOGRAM);
        assert.deepEqual(
          histogram.dataPoints
            .map(point => point.attributes['gen_ai.agent.name'])
            .sort(),
          ['child', 'parent']
        );
        for (const point of histogram.dataPoints) {
          assert.equal(point.value.count, count);
          assert.deepEqual(point.attributes, {
            'gen_ai.operation.name': 'invoke_workflow',
            'gen_ai.agent.name': point.attributes['gen_ai.agent.name'],
          });
        }
      });
    }

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
      const result = await reader.collect();
      const recorded = result.resourceMetrics.scopeMetrics.flatMap(
        scope => scope.metrics
      );
      assert.equal(recorded.length, 1);
      assert.ok(recorded[0].dataPointType === DataPointType.HISTOGRAM);
      assert.equal(recorded[0].dataPoints.length, 1);
      assert.equal(recorded[0].dataPoints[0].value.count, 1);
      assert.deepEqual(recorded[0].dataPoints[0].attributes, {
        'gen_ai.operation.name': 'invoke_workflow',
        'gen_ai.agent.name': 'failure',
        'error.type': 'TypeError',
      });
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
      if (state.privateState === 'nested') {
        trace.getTracer('graph-test').startSpan('inside-recursive-graph').end();
        return state;
      }
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
    assert.equal(spans.length, 3);
    const outer = spans.find(span => span.name === 'invoke_workflow outer');
    const inner = spans.find(span => span.name === 'invoke_workflow inner');
    assert.ok(outer && inner);
    assert.equal(inner.parentSpanContext?.spanId, outer.spanContext().spanId);
    assert.equal(
      spans.find(span => span.name === 'inside-recursive-graph')
        ?.parentSpanContext?.spanId,
      inner.spanContext().spanId
    );
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
    assert.equal(getTestSpans().length, 1);
  });

  it('does not make a validation failure into a successful operation', async () => {
    await assert.rejects(
      graph().invoke(input(), { recursionLimit: 0 }),
      /recursionLimit/
    );
    assert.deepEqual(getTestSpans(), []);
  });

  it('does not create agent-name dimensions from the SDK class name', async () => {
    const unnamed = new StateGraph(State)
      .addNode('step', state => state)
      .addEdge(START, 'step')
      .addEdge('step', END)
      .compile();
    await unnamed.invoke(input());
    assert.equal(getTestSpans()[0].name, 'invoke_workflow');
    assert.equal(getTestSpans()[0].attributes['gen_ai.agent.name'], undefined);
    const collection = await reader.collect();
    const recorded = collection.resourceMetrics.scopeMetrics.flatMap(
      scope => scope.metrics
    );
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].descriptor.name, 'gen_ai.invoke_agent.duration');
    assert.deepEqual(recorded[0].dataPoints[0].attributes, {
      'gen_ai.operation.name': 'invoke_workflow',
    });
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

  for (const includeAgentName of [undefined, 'inline'] as const) {
    for (const dynamic of [false, true]) {
      it(`excludes prebuilt agent model pipelines (inline=${!!includeAgentName}, dynamic=${dynamic})`, async () => {
        class Model extends FakeChatModel {
          override bindTools() {
            return this;
          }
        }
        const model = new Model({});
        const agent = createReactAgent({
          llm: dynamic ? async () => model : model,
          tools: [],
          name: 'prebuilt-agent',
          includeAgentName,
        });
        for (const configured of [
          agent,
          agent.withConfig({ runName: 'renamed' }),
        ]) {
          const result = await configured.invoke({
            messages: [new HumanMessage('hello')],
          });
          assert.equal(result.messages.at(-1)?.content, 'hello');
          for await (const chunk of await configured.stream({
            messages: [new HumanMessage('hello')],
          })) {
            assert.ok(chunk);
          }
        }
        assert.deepEqual(getTestSpans(), []);
        const result = await reader.collect();
        assert.deepEqual(
          result.resourceMetrics.scopeMetrics.flatMap(scope => scope.metrics),
          []
        );
      });
    }
  }

  for (const dynamic of [false, true]) {
    it(`preserves application compositions during prebuilt model setup and execution (dynamic=${dynamic})`, async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const application = () =>
        RunnableLambda.from((value: unknown) => value)
          .pipe(RunnableLambda.from((value: unknown) => value))
          .withConfig({ runName: 'agent' });
      let createdDuringSetup!: ReturnType<typeof application>;
      class Model extends FakeChatModel {
        override bindTools() {
          createdDuringSetup = application();
          return RunnableLambda.from((value: unknown) => value)
            .pipe(this)
            .withConfig({ runName: 'application-model' });
        }
        override async _generate(
          ...args: Parameters<FakeChatModel['_generate']>
        ) {
          await application().invoke('inside-model');
          return super._generate(...args);
        }
      }
      const model = new Model({});
      const agent = createReactAgent({
        llm: dynamic
          ? async () => {
              createdDuringSetup = application();
              await createdDuringSetup.invoke('inside-selector');
              return model;
            }
          : model,
        tools: [],
        includeAgentName: 'inline',
        prompt: RunnableLambda.from(
          (state: { messages: HumanMessage[] }) => state.messages
        )
          .pipe(RunnableLambda.from(messages => messages))
          .withConfig({ runName: 'application-prompt' }),
      });
      await agent.invoke({ messages: [new HumanMessage('hello')] });
      await createdDuringSetup.invoke('after-agent');
      const spans = getTestSpans();
      assert.deepEqual(
        spans.map(span => span.attributes['gen_ai.input.messages']).sort(),
        dynamic
          ? ['after-agent', 'hello', 'inside-model', 'inside-selector']
              .map(content =>
                JSON.stringify([
                  { role: 'user', parts: [{ type: 'text', content }] },
                ])
              )
              .sort()
          : ['after-agent', 'hello', 'hello', 'inside-model']
              .map(content =>
                JSON.stringify([
                  { role: 'user', parts: [{ type: 'text', content }] },
                ])
              )
              .sort()
      );
      const result = await reader.collect();
      const metrics = result.resourceMetrics.scopeMetrics.flatMap(
        scope => scope.metrics
      );
      assert.equal(metrics.length, 1);
      assert.ok(metrics[0].dataPointType === DataPointType.HISTOGRAM);
      assert.equal(
        metrics[0].dataPoints.reduce(
          (sum, point) => sum + point.value.count,
          0
        ),
        spans.length
      );
    });
  }

  it('tracks prebuilt pipelines built while disabled without hiding later application workflows', async () => {
    instrumentation.disable();
    class Model extends FakeChatModel {
      override bindTools() {
        return this;
      }
    }
    const agent = createReactAgent({
      llm: new Model({}),
      tools: [],
      includeAgentName: 'inline',
    });
    await agent.invoke({ messages: [new HumanMessage('disabled')] });
    instrumentation.enable();
    await agent.invoke({ messages: [new HumanMessage('enabled')] });
    assert.deepEqual(getTestSpans(), []);
    await RunnableLambda.from((value: string) => value)
      .pipe(RunnableLambda.from((value: string) => value))
      .invoke('application');
    assert.equal(getTestSpans().length, 1);
  });

  it('preserves compositions created in prebuilt agent callbacks', async () => {
    class Model extends FakeChatModel {
      override bindTools() {
        return this;
      }
    }
    const created: Runnable<string, string>[] = [];
    const agent = createReactAgent({ llm: new Model({}), tools: [] });
    await agent.invoke(
      { messages: [new HumanMessage('hello')] },
      {
        callbacks: [
          {
            handleChainStart() {
              created.push(
                RunnableLambda.from((value: string) => value).pipe(
                  RunnableLambda.from((value: string) => value)
                )
              );
            },
          },
        ],
      }
    );
    assert.deepEqual(getTestSpans(), []);
    assert.ok(created.length > 1);
    for (const workflow of created) await workflow.invoke('after-callback');
    assert.equal(getTestSpans().length, created.length);
  });

  it('preserves configurable-model resolution and bound application pipelines', async () => {
    class Model extends FakeChatModel {
      override bindTools() {
        return RunnableLambda.from((value: BaseLanguageModelInput) => value)
          .pipe(this)
          .withConfig({ runName: 'application-model' });
      }
    }
    const model = new Model({});
    const resolved = Promise.resolve(model);
    class ConfigurableModel extends Runnable<
      BaseLanguageModelInput,
      AIMessageChunk
    > {
      lc_namespace = ['test'];
      _queuedMethodOperations = {};
      _model() {
        return resolved;
      }
      async invoke(input: BaseLanguageModelInput) {
        return model.invoke(input);
      }
    }
    const configurable = new ConfigurableModel();
    const agent = createReactAgent({
      llm: configurable,
      tools: [],
      includeAgentName: 'inline',
    });
    assert.equal(configurable._model(), resolved);
    await agent.invoke({ messages: [new HumanMessage('hello')] });
    assert.equal(getTestSpans().length, 1);
    assert.equal(getTestSpans()[0].name, 'invoke_workflow agent');
  });

  for (const phase of ['binding', 'selection', 'execution'] as const) {
    it(`preserves prebuilt agent ${phase} errors without internal workflow telemetry`, async () => {
      const failure = new TypeError('private model failure');
      class Model extends FakeChatModel {
        override bindTools() {
          if (phase === 'binding') throw failure;
          return this;
        }
        override async _generate(
          ...args: Parameters<FakeChatModel['_generate']>
        ) {
          if (phase === 'execution') throw failure;
          return super._generate(...args);
        }
      }
      const agent = createReactAgent({
        llm:
          phase === 'selection'
            ? async () => {
                throw failure;
              }
            : new Model({}),
        tools: [],
        includeAgentName: 'inline',
      });
      await assert.rejects(
        agent.invoke({ messages: [new HumanMessage('hello')] }),
        error => error === failure
      );
      assert.deepEqual(getTestSpans(), []);
      const result = await reader.collect();
      assert.deepEqual(
        result.resourceMetrics.scopeMetrics.flatMap(scope => scope.metrics),
        []
      );
    });
  }

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
