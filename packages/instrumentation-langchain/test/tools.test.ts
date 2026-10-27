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
import { TelemetryHandler } from '@opentelemetry/genai-util';
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
  CallbackManager,
  CallbackManagerForChainRun,
} from '@langchain/core/callbacks/manager';
import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import {
  DynamicTool,
  DynamicStructuredTool,
  StructuredTool,
  Tool,
  tool,
} from '@langchain/core/tools';
import { ToolMessage } from '@langchain/core/messages';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import * as sinon from 'sinon';

function echo() {
  return new DynamicTool({
    name: 'echo',
    description: 'Returns the input',
    func: async value => value,
  });
}

describe('LangChain donated tool callbacks', () => {
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
    instrumentation.setTracerProvider(trace.getTracerProvider());
    instrumentation.setMeterProvider(metrics.getMeterProvider());
    sinon.restore();
    diag.disable();
    await meter.shutdown();
  });

  async function points() {
    const result = await reader.collect();
    assert.deepEqual(result.errors, []);
    return result.resourceMetrics.scopeMetrics.flatMap(scope =>
      scope.metrics.flatMap(metric => {
        assert.equal(metric.descriptor.name, 'gen_ai.execute_tool.duration');
        assert.equal(metric.descriptor.unit, 's');
        assert.ok(metric.dataPointType === DataPointType.HISTOGRAM);
        return metric.dataPoints;
      })
    );
  }

  for (const capture of ['none', 'span_only'] as const) {
    it(`migrates the donated public tool invocation (capture=${capture})`, async () => {
      const startTool = sinon.spy(TelemetryHandler.prototype, 'startTool');
      instrumentation.setConfig({ captureMessageContent: capture });
      const sourceTool = tool(async () => 'this is a test tool', {
        name: 'test_tool',
        description: 'Local donated scenario',
      });
      assert.equal(await sourceTool.invoke('hello'), 'this is a test tool');
      assert.equal(startTool.callCount, 1);
      const spans = getTestSpans();
      assert.equal(spans.length, 1);
      assert.equal(spans[0].name, 'execute_tool test_tool');
      assert.equal(spans[0].kind, SpanKind.INTERNAL);
      assert.deepEqual(spans[0].status, { code: SpanStatusCode.UNSET });
      assert.equal(
        spans[0].instrumentationScope.name,
        instrumentation.instrumentationName
      );
      assert.equal(
        spans[0].instrumentationScope.version,
        instrumentation.instrumentationVersion
      );
      assert.ok(spans[0].instrumentationScope.schemaUrl);
      const attributes = {
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': 'test_tool',
        'gen_ai.tool.type': 'function',
      };
      assert.deepEqual(
        spans[0].attributes,
        capture === 'none'
          ? attributes
          : {
              ...attributes,
              'gen_ai.tool.call.arguments': '{"input":"hello"}',
              'gen_ai.tool.call.result': '{"output":"this is a test tool"}',
            }
      );
      const recorded = await points();
      assert.equal(recorded.length, 1);
      assert.equal(recorded[0].value.count, 1);
      assert.equal(recorded[0].value.sum, hrTimeToSeconds(spans[0].duration));
      assert.deepEqual(recorded[0].attributes, {
        'gen_ai.tool.name': 'test_tool',
        'gen_ai.tool.type': 'function',
      });
      assert.deepEqual(
        recorded[0].value.buckets.boundaries,
        [
          0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24,
          20.48, 40.96, 81.92,
        ]
      );
    });
  }

  it('retains structured tool arguments and results as JSON objects', async () => {
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    const output = { forecast: 'sunny' };
    const weather = new DynamicStructuredTool({
      name: 'weather',
      description: 'Local weather tool',
      schema: echo().schema.innerType().required(),
      func: async () => output,
    });
    assert.equal(await weather.invoke({ input: 'Seattle' }), output);
    const span = getTestSpans()[0];
    assert.deepEqual(
      JSON.parse(String(span.attributes['gen_ai.tool.call.arguments'])),
      { input: 'Seattle' }
    );
    assert.deepEqual(
      JSON.parse(String(span.attributes['gen_ai.tool.call.result'])),
      output
    );
  });

  for (const capture of ['none', 'span_only'] as const) {
    for (const input of [
      42,
      0,
      true,
      false,
      null,
      [],
      ['one', 42, false, null],
      'plain text',
      '{invalid json',
    ]) {
      it(`retains scalar and array tool arguments (${JSON.stringify(input)}, capture=${capture})`, async () => {
        instrumentation.setConfig({ captureMessageContent: capture });
        const operation = new DynamicStructuredTool({
          name: 'argument-shapes',
          description: 'Scalar and array arguments',
          schema: {},
          func: async (value: unknown) => value,
        });
        assert.equal(await operation.invoke(input), input);
        const spans = getTestSpans();
        assert.equal(spans.length, 1);
        assert.equal(
          spans[0].attributes['gen_ai.tool.call.arguments'],
          capture === 'none' ? undefined : JSON.stringify({ input })
        );
        assert.equal(
          spans[0].attributes['gen_ai.tool.call.result'],
          capture === 'none' ? undefined : JSON.stringify({ output: input })
        );
      });
    }
  }

  for (const output of [
    'text',
    '42',
    'false',
    'null',
    '["one","two"]',
    '"quoted"',
    ['one', 'two'],
    0,
    false,
    null,
    undefined,
  ]) {
    it(`retains the SDK result and represents non-object content (${JSON.stringify(output)})`, async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const operation = new DynamicStructuredTool({
        name: 'result',
        description: 'Synthetic result shapes',
        schema: echo().schema.innerType().required(),
        func: async () => output,
      });
      assert.equal(await operation.invoke({ input: '' }), output);
      assert.equal(
        getTestSpans()[0].attributes['gen_ai.tool.call.result'],
        output === undefined ? undefined : JSON.stringify({ output })
      );
    });
  }

  it('records the available tool-call ID without replacing the ToolMessage', async () => {
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    const result: unknown = await echo().invoke({
      type: 'tool_call',
      id: 'call-1',
      name: 'echo',
      args: { input: 'hello' },
    });
    assert.ok(result instanceof ToolMessage);
    assert.equal(result.tool_call_id, 'call-1');
    assert.equal(result.content, 'hello');
    const span = getTestSpans()[0];
    assert.equal(span.attributes['gen_ai.tool.call.id'], 'call-1');
    assert.deepEqual(
      JSON.parse(String(span.attributes['gen_ai.tool.call.result'])),
      JSON.parse(JSON.stringify(result))
    );
  });

  it('records a tool-call ID that is only available in the final ToolMessage', async () => {
    const callbacks = new CallbackManager();
    const run = await callbacks.handleToolStart(
      echo().toJSON(),
      'hello',
      'tool-run'
    );
    await run.handleToolEnd(
      new ToolMessage({
        content: 'hello',
        tool_call_id: 'late-call-1',
      })
    );
    assert.equal(
      getTestSpans()[0].attributes['gen_ai.tool.call.id'],
      'late-call-1'
    );
  });

  it('prefers the start-time tool-call ID when the SDK supplies one', async () => {
    const startTool = sinon.spy(TelemetryHandler.prototype, 'startTool');
    const output = new ToolMessage({
      content: 'hello',
      tool_call_id: 'message-call-1',
    });
    const operation = new DynamicTool({
      name: 'call-id',
      description: '',
      func: async () => output,
    });
    assert.equal(
      await operation.invoke({
        type: 'tool_call',
        id: 'start-call-1',
        name: 'call-id',
        args: { input: 'hello' },
      }),
      output
    );
    assert.equal(startTool.callCount, 1);
    // Older SDK versions only expose the ID through the final ToolMessage.
    const initialId = startTool.firstCall.args[0].toolCallId;
    assert.equal(
      getTestSpans()[0].attributes['gen_ai.tool.call.id'],
      initialId || 'message-call-1'
    );
  });

  for (const { value, expected } of [
    { value: ['first', 'second'], expected: { output: ['first', 'second'] } },
    { value: 'text', expected: { output: 'text' } },
    { value: 0, expected: { output: 0 } },
    { value: false, expected: { output: false } },
    { value: null, expected: { output: null } },
    { value: undefined, expected: undefined },
    { value: { answer: 'yes' }, expected: { answer: 'yes' } },
  ]) {
    it(`normalizes the serialized result shape (${JSON.stringify(value)})`, async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const toJSON = sinon.spy(() => value);
      const output = { toJSON };
      const operation = new DynamicStructuredTool({
        name: 'serialized-result',
        description: '',
        schema: echo().schema.innerType().required(),
        func: async () => output,
      });
      assert.equal(await operation.invoke({ input: '' }), output);
      assert.ok(toJSON.calledOnce);
      assert.equal(
        getTestSpans()[0].attributes['gen_ai.tool.call.result'],
        JSON.stringify(expected)
      );
      assert.equal(getTestSpans()[0].status.code, SpanStatusCode.UNSET);
      assert.equal((await points())[0].value.count, 1);
    });
  }

  it('does not serialize tool results when capture is disabled', async () => {
    const toJSON = sinon.spy(() => {
      throw new Error('private serialization failure');
    });
    const output = { toJSON };
    const operation = new DynamicStructuredTool({
      name: 'no-capture',
      description: '',
      schema: echo().schema.innerType().required(),
      func: async () => output,
    });
    assert.equal(await operation.invoke({ input: '' }), output);
    assert.ok(toJSON.notCalled);
    assert.equal(
      getTestSpans()[0].attributes['gen_ai.tool.call.result'],
      undefined
    );
  });

  for (const invalid of [false, true]) {
    it(`migrates serialized name and description precedence (invalid=${invalid})`, async () => {
      class SerializedTool extends DynamicTool {
        override toJSON() {
          return Object.defineProperties(super.toJSON(), {
            name: { value: invalid ? 42 : 'serialized-tool', enumerable: true },
            description: {
              value: invalid ? {} : 'serialized description',
              enumerable: true,
            },
          });
        }
      }
      await new SerializedTool({
        name: 'configured-tool',
        description: '',
        func: async value => value,
      }).invoke('hello', { runName: 'run-name' });
      const span = getTestSpans()[0];
      assert.equal(
        span.name,
        `execute_tool ${invalid ? 'run-name' : 'serialized-tool'}`
      );
      assert.equal(
        span.attributes['gen_ai.tool.description'],
        invalid ? undefined : 'serialized description'
      );
    });
  }

  it('maps only the donated conversation metadata aliases', async () => {
    await echo().invoke('hello', {
      metadata: {
        session_id: 'session',
        thread_id: 'thread',
        conversation_id: 'conversation',
        secret: 'private-metadata',
      },
    });
    assert.equal(
      getTestSpans()[0].attributes['gen_ai.conversation.id'],
      'session'
    );
    assert.equal(
      JSON.stringify(getTestSpans()[0].attributes).includes('private-metadata'),
      false
    );
    assert.equal(
      JSON.stringify((await points())[0].attributes).includes('session'),
      false
    );
  });

  it('keeps callback-free non-tool invocations on the SDK fast path', async () => {
    const start = sinon.spy(CallbackManager.prototype, 'handleChainStart');
    const end = sinon.spy(CallbackManagerForChainRun.prototype, 'handleChainEnd');
    const step = RunnableLambda.from((value: string) => value);
    const workflow = RunnableSequence.from([step, step]);
    assert.equal(await step.invoke('step'), 'step');
    assert.equal(await workflow.invoke('workflow'), 'workflow');
    assert.deepEqual(await workflow.batch(['first', 'second']), [
      'first',
      'second',
    ]);
    assert.equal(CallbackManager.configure(), undefined);
    assert.equal(start.callCount, 0);
    assert.equal(end.callCount, 0);
  });

  it('preserves explicitly configured non-tool callbacks', async () => {
    const start = sinon.spy();
    const end = sinon.spy();
    const methods = { handleChainStart: start, handleChainEnd: end };
    const callbacks = [methods];
    const step = RunnableLambda.from((value: string) => value);
    assert.equal(await step.invoke('hello', { callbacks }), 'hello');
    await awaitAllCallbacks();
    assert.equal(start.callCount, 1);
    assert.equal(end.callCount, 1);
    assert.deepEqual(callbacks, [methods]);
  });

  it('does not leak tool callback configuration to callback-free runnables', async () => {
    const start = sinon.spy(CallbackManager.prototype, 'handleChainStart');
    const step = RunnableLambda.from((value: string) => value);
    const options = {
      callbacks: undefined,
      runName: 'tool-only',
      tags: ['tool-tag'],
      metadata: { session_id: 'session' },
    };
    const operation = new DynamicTool({
      name: 'tool-only',
      description: '',
      func: async value => step.invoke(value),
    });
    assert.equal(await operation.call('hello', options), 'hello');
    assert.equal(await step.invoke('after-tool', options), 'after-tool');
    assert.equal(options.callbacks, undefined);
    assert.equal(CallbackManager.configure(), undefined);
    assert.equal(start.callCount, 0);
    const spans = getTestSpans();
    assert.equal(spans.length, 1);
    assert.equal(spans[0].name, 'execute_tool tool-only');
    assert.equal(spans[0].attributes['gen_ai.conversation.id'], 'session');
  });

  for (const method of ['invoke', 'call'] as const) {
    for (const mode of ['none', 'array', 'manager', 'local-manager'] as const) {
      it(`preserves user callbacks and registers once (${method}, ${mode})`, async () => {
        const start = sinon.spy();
        const end = sinon.spy();
        const methods = { handleToolStart: start, handleToolEnd: end };
        const array = [methods];
        const manager = CallbackManager.fromHandlers(methods);
        const callbacks =
          mode === 'none' ? undefined : mode === 'array' ? array : manager;
        const handlers = manager.handlers.slice();
        const operation = echo();
        if (mode === 'local-manager') operation.callbacks = manager;
        // call() still accepts legacy callback arrays and managers at runtime.
        const invoke = () =>
          method === 'invoke'
            ? operation.invoke('hello', { callbacks })
            : Reflect.apply(operation.call, operation, ['hello', callbacks]);
        instrumentation.disable();
        for (let index = 0; index < 2; index++) await invoke();
        await awaitAllCallbacks();
        const startCount = start.callCount;
        const endCount = end.callCount;
        start.resetHistory();
        end.resetHistory();
        instrumentation.enable();
        for (let index = 0; index < 2; index++) await invoke();
        await awaitAllCallbacks();
        assert.equal(getTestSpans().length, 2);
        assert.deepEqual(array, [methods]);
        assert.deepEqual(manager.handlers, handlers);
        assert.equal(start.callCount, startCount);
        assert.equal(end.callCount, endCount);
      });
    }
  }

  it('preserves explicit tool callbacks while tracing is suppressed', async () => {
    const start = sinon.spy();
    const end = sinon.spy();
    const callbacks = [{ handleToolStart: start, handleToolEnd: end }];
    assert.equal(
      await context.with(suppressTracing(context.active()), () =>
        echo().invoke('hello', { callbacks })
      ),
      'hello'
    );
    await awaitAllCallbacks();
    assert.equal(start.callCount, 1);
    assert.equal(end.callCount, 1);
    assert.equal(getTestSpans().length, 0);
  });

  it('does not duplicate handlers inherited from an already configured manager', async () => {
    const callbacks = CallbackManager.configure([]);
    assert.ok(callbacks);
    const before = callbacks.handlers.slice();
    const operation = echo();
    operation.callbacks = callbacks;
    assert.equal(await operation.invoke('hello', { callbacks }), 'hello');
    assert.equal(getTestSpans().length, 1);
    assert.deepEqual(callbacks.handlers, before);
  });

  it('preserves the active parent and donated parent-run nesting', async () => {
    const parent = trace.getTracer('tool-test').startSpan('application');
    const inner = tool(async (value: string) => value, { name: 'inner' });
    const outer = tool(
      async (value: string, config) => inner.invoke(value, config),
      { name: 'outer' }
    );
    await context.with(trace.setSpan(context.active(), parent), () =>
      outer.invoke('hello')
    );
    const spans = getTestSpans();
    assert.equal(spans.length, 2);
    const outerSpan = spans.find(span => span.name === 'execute_tool outer')!;
    const innerSpan = spans.find(span => span.name === 'execute_tool inner')!;
    assert.equal(
      outerSpan.parentSpanContext?.spanId,
      parent.spanContext().spanId
    );
    assert.equal(
      innerSpan.parentSpanContext?.spanId,
      outerSpan.spanContext().spanId
    );
    assert.equal(trace.getSpan(context.active()), undefined);
    parent.end();
  });

  for (const kind of [
    'tool',
    'DynamicTool',
    'DynamicStructuredTool',
    'Tool subclass',
    'StructuredTool subclass',
  ]) {
    for (const hasParent of [false, true]) {
      it(`activates the tool context across async execution (${kind}, parent=${hasParent})`, async () => {
        const tracer = trace.getTracer('tool-test');
        const parent = hasParent ? tracer.startSpan('application') : undefined;
        const caller = parent
          ? trace.setSpan(context.active(), parent)
          : context.active();
        const func = async () => {
          tracer.startSpan('before-await').end();
          await new Promise<void>(resolve => setImmediate(resolve));
          tracer.startSpan('after-await').end();
          return 'result';
        };
        const schema = echo().schema.innerType().required();
        class CustomTool extends Tool {
          name = 'context';
          description = '';
          protected _call() {
            return func();
          }
        }
        class CustomStructuredTool extends StructuredTool<typeof schema> {
          name = 'context';
          description = '';
          schema = schema;
          protected _call() {
            return func();
          }
        }
        const fields = { name: 'context', description: '', func };
        const operation: {
          invoke(input: { input: string }): Promise<unknown>;
        } =
          kind === 'tool'
            ? tool(func, fields)
            : kind === 'DynamicTool'
              ? new DynamicTool(fields)
              : kind === 'DynamicStructuredTool'
                ? new DynamicStructuredTool({ ...fields, schema })
                : kind === 'Tool subclass'
                  ? new CustomTool()
                  : new CustomStructuredTool();
        try {
          await context.with(caller, async () => {
            assert.equal(await operation.invoke({ input: 'hello' }), 'result');
            assert.equal(context.active(), caller);
          });
          const spans = getTestSpans();
          assert.equal(spans.length, 3);
          const toolSpan = spans.find(
            span => span.attributes['gen_ai.operation.name'] === 'execute_tool'
          )!;
          assert.equal(
            toolSpan.parentSpanContext?.spanId,
            parent?.spanContext().spanId
          );
          for (const name of ['before-await', 'after-await']) {
            const child = spans.find(span => span.name === name)!;
            assert.equal(
              child.parentSpanContext?.spanId,
              toolSpan.spanContext().spanId
            );
            assert.equal(
              child.spanContext().traceId,
              toolSpan.spanContext().traceId
            );
          }
          assert.equal(trace.getSpan(context.active()), undefined);
        } finally {
          parent?.end();
        }
      });
    }
  }

  it('isolates execution contexts for concurrent calls with a reused run ID', async () => {
    const tracer = trace.getTracer('tool-test');
    const callbacks = CallbackManager.configure([]);
    const runId = '00000000-0000-4000-8000-000000000001';
    let enter!: () => void;
    const entered = new Promise<void>(resolve => {
      enter = resolve;
    });
    const active = new Map<string, string | undefined>();
    const operation = new DynamicTool({
      name: 'concurrent',
      description: '',
      func: async input => {
        active.set(input, trace.getSpanContext(context.active())?.spanId);
        if (active.size === 2) enter();
        await entered;
        tracer.startSpan(input).end();
        return input;
      },
    });
    assert.deepEqual(
      await Promise.all([
        operation.invoke('first', { callbacks, runId }),
        operation.invoke('second', { callbacks, runId }),
      ]),
      ['first', 'second']
    );
    const spans = getTestSpans();
    assert.equal(spans.length, 4);
    const tools = spans.filter(span => span.name === 'execute_tool concurrent');
    assert.equal(tools.length, 2);
    assert.notEqual(active.get('first'), active.get('second'));
    for (const input of ['first', 'second']) {
      const child = spans.find(span => span.name === input)!;
      assert.equal(child.parentSpanContext?.spanId, active.get(input));
      assert.ok(
        tools.some(span => span.spanContext().spanId === active.get(input))
      );
    }
    assert.equal(trace.getSpan(context.active()), undefined);
  });

  it('nests workflows and tools invoked without explicit callbacks inside a tool', async () => {
    const workflow = RunnableSequence.from([
      echo(),
      RunnableLambda.from((value: string) => value),
    ]);
    const outer = new DynamicTool({
      name: 'outer',
      description: '',
      func: async value => workflow.invoke(value),
    });
    assert.equal(await outer.invoke('hello'), 'hello');
    const spans = getTestSpans();
    assert.equal(spans.length, 3);
    const outerSpan = spans.find(span => span.name === 'execute_tool outer')!;
    const workflowSpan = spans.find(span => span.name === 'invoke_workflow')!;
    const innerSpan = spans.find(span => span.name === 'execute_tool echo')!;
    assert.equal(
      workflowSpan.parentSpanContext?.spanId,
      outerSpan.spanContext().spanId
    );
    assert.equal(
      innerSpan.parentSpanContext?.spanId,
      workflowSpan.spanContext().spanId
    );
  });

  for (const asynchronous of [false, true]) {
    it(`restores the caller context after tool failures (async=${asynchronous})`, async () => {
      const tracer = trace.getTracer('tool-test');
      const parent = tracer.startSpan('application');
      const caller = trace.setSpan(context.active(), parent);
      const failure = new Error('tool failure');
      const operation = new DynamicTool({
        name: 'failure',
        description: '',
        func: () => {
          tracer.startSpan('child').end();
          if (asynchronous) return Promise.reject(failure);
          throw failure;
        },
      });
      try {
        await context.with(caller, async () => {
          await assert.rejects(
            operation.invoke('hello'),
            error => error === failure
          );
          assert.equal(context.active(), caller);
        });
        const spans = getTestSpans();
        assert.equal(spans.length, 2);
        const toolSpan = spans.find(
          span => span.name === 'execute_tool failure'
        )!;
        const child = spans.find(span => span.name === 'child')!;
        assert.equal(
          child.parentSpanContext?.spanId,
          toolSpan.spanContext().spanId
        );
        assert.equal(toolSpan.status.code, SpanStatusCode.ERROR);
        assert.equal(trace.getSpan(context.active()), undefined);
      } finally {
        parent.end();
      }
    });
  }

  it('preserves the execution Promise and restores the original method when disabled', async () => {
    const original = DynamicTool.prototype._call;
    const result = Promise.resolve('result');
    const operation = new DynamicTool({
      name: 'identity',
      description: '',
      func: () => result,
    });
    assert.equal(await operation.invoke('hello'), 'result');
    assert.notEqual(DynamicTool.prototype._call, original);
    const callbacks = CallbackManager.configure([]);
    assert.ok(callbacks);
    const run = await callbacks.handleToolStart(operation.toJSON(), 'hello');
    try {
      assert.equal(operation._call('hello', run), result);
      assert.equal(trace.getSpan(context.active()), undefined);
    } finally {
      await run.handleToolEnd(await result);
    }
    instrumentation.disable();
    assert.equal(DynamicTool.prototype._call, original);
  });

  for (const mode of ['disabled', 'suppressed']) {
    it(`leaves the execution context unchanged while ${mode}`, async () => {
      const caller =
        mode === 'suppressed'
          ? suppressTracing(context.active())
          : context.active();
      if (mode === 'disabled') instrumentation.disable();
      const operation = new DynamicTool({
        name: 'untraced',
        description: '',
        func: async () => {
          assert.equal(context.active(), caller);
          await new Promise<void>(resolve => setImmediate(resolve));
          assert.equal(context.active(), caller);
          return 'result';
        },
      });
      assert.equal(
        await context.with(caller, () => operation.invoke('hello')),
        'result'
      );
      assert.equal(getTestSpans().length, 0);
    });
  }

  it('leaves the merged workflow span in place around tool execution', async () => {
    await RunnableSequence.from([
      echo(),
      RunnableLambda.from((value: string) => value),
    ]).invoke('hello');
    const spans = getTestSpans();
    assert.equal(spans.length, 2);
    const workflow = spans.find(span => span.name === 'invoke_workflow')!;
    const toolSpan = spans.find(span => span.name === 'execute_tool echo')!;
    assert.equal(
      toolSpan.parentSpanContext?.spanId,
      workflow.spanContext().spanId
    );
  });

  it('does not emit native or instrumented tool telemetry while disabled or suppressed', async () => {
    const startTool = sinon.spy(TelemetryHandler.prototype, 'startTool');
    const start = sinon.spy(CallbackManager.prototype, 'handleToolStart');
    instrumentation.disable();
    await echo().invoke('hello');
    instrumentation.enable();
    await context.with(suppressTracing(context.active()), () =>
      echo().invoke('hello')
    );
    assert.equal(getTestSpans().length, 0);
    assert.deepEqual(await points(), []);
    assert.equal(startTool.callCount, 0);
    assert.equal(start.callCount, 0);
  });

  it('removes completed run state and supports repeated enable/disable', async () => {
    for (let index = 0; index < 3; index++) {
      instrumentation.disable();
      instrumentation.enable();
      await echo().invoke('hello', {
        runId: '00000000-0000-4000-8000-000000000001',
      });
    }
    assert.equal(getTestSpans().length, 3);
    assert.ok(
      getTestSpans().every(span => span.parentSpanContext === undefined)
    );
    assert.equal((await points())[0].value.count, 3);
    await echo().invoke('independent', {
      callbacks: new CallbackManager('00000000-0000-4000-8000-000000000001'),
    });
    assert.equal(getTestSpans()[3].parentSpanContext, undefined);
  });

  for (const capture of ['none', 'span_only'] as const) {
    it(`keeps 1000 active runs and skips new telemetry until space opens (capture=${capture})`, async function () {
      this.timeout(15000);
      const warn = sinon.spy();
      diag.setLogger(
        { warn, error() {}, info() {}, debug() {}, verbose() {} },
        DiagLogLevel.WARN
      );
      instrumentation.setConfig({ captureMessageContent: capture });
      const startTool = sinon.spy(TelemetryHandler.prototype, 'startTool');
      const onEnd = sinon.spy();
      const onError = sinon.spy();
      const releases: Array<() => void> = [];
      const results: Array<Promise<string>> = [];
      const active = new Map<string, string | undefined>();
      let entered: () => void;
      const operation = new DynamicTool({
        name: 'pending',
        description: '',
        func: input =>
          new Promise<string>(resolve => {
            active.set(input, trace.getSpanContext(context.active())?.spanId);
            releases.push(() => resolve(input));
            entered();
          }),
      });
      try {
        for (let index = 0; index < 1003; index++) {
          const started = new Promise<void>(resolve => {
            entered = resolve;
          });
          results.push(
            operation.invoke(`private-input-${index}`, {
              callbacks: [{ handleToolEnd: onEnd }],
              runName: `pending-${index}`,
              runId: `00000000-0000-4000-8000-${String(
                index === 1002 ? 0 : index
              ).padStart(12, '0')}`,
            })
          );
          await started;
          assert.equal(startTool.callCount, Math.min(index + 1, 1000));
          assert.equal(getTestSpans().length, 0);
        }
        assert.ok(active.get('private-input-0'));
        for (let index = 1000; index < 1003; index++) {
          assert.equal(active.get(`private-input-${index}`), undefined);
        }
        assert.deepEqual(await points(), []);
        assert.equal(warn.callCount, 3);
        assert.ok(
          warn.calledWith(
            sinon.match.string,
            'LangChain: pending tool limit reached, skipping new tool telemetry'
          )
        );
        for (const release of releases.slice(1000)) release();
        assert.deepEqual(await Promise.all(results.slice(1000)), [
          'private-input-1000',
          'private-input-1001',
          'private-input-1002',
        ]);
        await awaitAllCallbacks();
        assert.equal(onEnd.callCount, 3);
        assert.equal(getTestSpans().length, 0);
        assert.deepEqual(await points(), []);

        const failure = new TypeError('private-failure');
        const failing = new DynamicTool({
          name: 'skipped-failure',
          description: '',
          func: async () => {
            throw failure;
          },
        });
        await assert.rejects(
          failing.invoke('private-input', {
            callbacks: [{ handleToolError: onError }],
          }),
          error => error === failure
        );
        await awaitAllCallbacks();
        assert.equal(onError.callCount, 1);
        assert.equal(onError.firstCall.args[0], failure);
        assert.equal(startTool.callCount, 1000);
        assert.equal(getTestSpans().length, 0);
        assert.deepEqual(await points(), []);
        assert.equal(warn.callCount, 4);
        assert.equal(JSON.stringify(warn.args).includes('private-'), false);

        releases[0]();
        assert.equal(await results[0], 'private-input-0');
        assert.equal(getTestSpans().length, 1);
        const span = getTestSpans()[0];
        assert.equal(span.name, 'execute_tool pending-0');
        assert.equal(span.status.code, SpanStatusCode.UNSET);
        assert.equal(span.attributes['error.type'], undefined);
        assert.equal(
          span.attributes['gen_ai.tool.call.arguments'],
          capture === 'none' ? undefined : '{"input":"private-input-0"}'
        );
        assert.equal(
          span.attributes['gen_ai.tool.call.result'],
          capture === 'none' ? undefined : '{"output":"private-input-0"}'
        );
        assert.deepEqual(span.events, []);
        assert.equal((await points())[0].value.count, 1);
        assert.equal(
          (await points())[0].value.sum,
          hrTimeToSeconds(span.duration)
        );

        assert.equal(await echo().invoke('resumed'), 'resumed');
        assert.equal(getTestSpans().length, 2);
        assert.equal(startTool.callCount, 1001);
        assert.equal(warn.callCount, 4);
      } finally {
        for (const release of releases) release();
        await Promise.all(results);
      }
      assert.equal(getTestSpans().length, 1001);
      const recorded = await points();
      assert.equal(
        recorded.reduce((count, point) => count + point.value.count, 0),
        1001
      );
      assert.ok(
        recorded.every(
          point =>
            ![
              'pending-1000',
              'pending-1001',
              'pending-1002',
              'skipped-failure',
            ].includes(String(point.attributes['gen_ai.tool.name']))
        )
      );
      await awaitAllCallbacks();
      assert.equal(onEnd.callCount, 1003);
    });
  }

  it('counts overlapping runs separately and frees each pending slot only once', async function () {
    this.timeout(15000);
    const startTool = sinon.spy(TelemetryHandler.prototype, 'startTool');
    const callbacks = CallbackManager.configure([]);
    assert.ok(callbacks);
    const serialized = echo().toJSON();
    const pending: Awaited<ReturnType<CallbackManager['handleToolStart']>>[] =
      [];
    const start = async () => {
      const run = await callbacks.handleToolStart(serialized, '', 'reused');
      pending.push(run);
      return run;
    };
    try {
      for (let index = 0; index < 1000; index++) await start();
      const skipped = await start();
      assert.equal(startTool.callCount, 1000);

      await pending[0].handleToolEnd('first');
      const replacement = await start();
      assert.equal(startTool.callCount, 1001);

      await pending[0].handleToolError(new Error('duplicate'));
      await skipped.handleToolEnd('skipped');
      await start();
      assert.equal(startTool.callCount, 1001);
      assert.equal(getTestSpans().length, 1);

      await replacement.handleToolError(new TypeError('replacement-error'));
      await start();
      assert.equal(startTool.callCount, 1002);
    } finally {
      await Promise.all(pending.map(run => run.handleToolEnd('cleanup')));
    }
    assert.equal(getTestSpans().length, 1002);
    assert.equal(
      (await points()).reduce((count, point) => count + point.value.count, 0),
      1002
    );
  });

  for (const ending of ['end', 'error'] as const) {
    it(`ignores skipped ${ending} callbacks and resumes tracking after ${ending} with a reused run ID`, async function () {
      this.timeout(15000);
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const callbacks = CallbackManager.configure([]);
      assert.ok(callbacks);
      const pending: Awaited<ReturnType<CallbackManager['handleToolStart']>>[] =
        [];
      const serialized = echo().toJSON();
      const start = async (runId: string) => {
        const run = await callbacks.handleToolStart(serialized, runId, runId);
        pending.push(run);
        return run;
      };
      try {
        const tracked = [];
        for (let index = 0; index < 1000; index++) {
          tracked.push(await start(`pending-${index}`));
        }
        const skipped = await start('reused');
        assert.equal(getTestSpans().length, 0);
        assert.deepEqual(await points(), []);

        if (ending === 'end') await tracked[0].handleToolEnd('tracked-result');
        else await tracked[0].handleToolError(new TypeError('tracked-error'));
        assert.equal(getTestSpans().length, 1);
        assert.equal(
          getTestSpans()[0].status.code,
          ending === 'end' ? SpanStatusCode.UNSET : SpanStatusCode.ERROR
        );
        assert.equal(
          getTestSpans()[0].attributes['error.type'],
          ending === 'end' ? undefined : 'TypeError'
        );
        assert.equal((await points())[0].value.count, 1);

        const replacement = await start('reused');
        if (ending === 'end') await skipped.handleToolEnd('stale-result');
        else await skipped.handleToolError(new TypeError('stale-error'));
        assert.equal(getTestSpans().length, 1);
        assert.equal((await points())[0].value.count, 1);

        await replacement.handleToolEnd('current-result');
        const span = getTestSpans()[1];
        assert.equal(span.status.code, SpanStatusCode.UNSET);
        assert.equal(span.attributes['error.type'], undefined);
        assert.equal(
          span.attributes['gen_ai.tool.call.result'],
          '{"output":"current-result"}'
        );
        await replacement.handleToolEnd('duplicate-result');
        assert.equal(getTestSpans().length, 2);
        assert.equal(
          (await points()).reduce(
            (count, point) => count + point.value.count,
            0
          ),
          2
        );
      } finally {
        await Promise.all(pending.map(run => run.handleToolEnd('cleanup')));
      }
      assert.equal(getTestSpans().length, 1001);
      assert.equal(
        (await points()).reduce((count, point) => count + point.value.count, 0),
        1001
      );
    });
  }

  for (const first of ['older', 'newer'] as const) {
    it(`keeps overlapping runs with the same ID independent when the ${first} run finishes first`, async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const callbacks = CallbackManager.configure([]);
      assert.ok(callbacks);
      const serialized = echo().toJSON();
      const older = await callbacks.handleToolStart(
        serialized,
        'older-input',
        'reused'
      );
      const newer = await callbacks.handleToolStart(
        serialized,
        'newer-input',
        'reused'
      );
      try {
        const failOlder = () =>
          older.handleToolError(new TypeError('older-error'));
        const finishNewer = () => newer.handleToolEnd('newer-result');
        await (first === 'older' ? failOlder() : finishNewer());
        assert.equal(getTestSpans().length, 1);
        await (first === 'older' ? finishNewer() : failOlder());
        const spans = getTestSpans();
        assert.equal(spans.length, 2);
        const failed = spans.find(
          span => span.attributes['error.type'] === 'TypeError'
        )!;
        assert.equal(failed.status.code, SpanStatusCode.ERROR);
        assert.equal(
          failed.attributes['gen_ai.tool.call.arguments'],
          '{"input":"older-input"}'
        );
        const succeeded = spans.find(span => span !== failed)!;
        assert.equal(succeeded.status.code, SpanStatusCode.UNSET);
        assert.equal(
          succeeded.attributes['gen_ai.tool.call.arguments'],
          '{"input":"newer-input"}'
        );
        assert.equal(
          succeeded.attributes['gen_ai.tool.call.result'],
          '{"output":"newer-result"}'
        );
        assert.equal(
          (await points()).reduce(
            (count, point) => count + point.value.count,
            0
          ),
          2
        );
      } finally {
        await older.handleToolEnd('cleanup');
        await newer.handleToolEnd('cleanup');
      }
    });
  }

  for (const capture of ['none', 'span_only'] as const) {
    it(`preserves SDK failures and records only content-free errors (capture=${capture})`, async () => {
      instrumentation.setConfig({ captureMessageContent: capture });
      const failure = new TypeError('private-failure');
      const operation = new DynamicTool({
        name: 'failure',
        description: '',
        func: async () => {
          throw failure;
        },
      });
      await assert.rejects(
        operation.invoke('input'),
        error => error === failure
      );
      const span = getTestSpans()[0];
      assert.deepEqual(span.status, { code: SpanStatusCode.ERROR });
      assert.equal(span.attributes['error.type'], 'TypeError');
      assert.equal(span.attributes['gen_ai.tool.call.result'], undefined);
      assert.deepEqual(span.events, []);
      assert.equal(
        JSON.stringify(span.attributes).includes('private-failure'),
        false
      );
      assert.equal((await points())[0].attributes['error.type'], 'TypeError');
    });
  }

  for (const mode of ['direct', 'copied', 'configured', 'invoke'] as const) {
    it(`parents the older run's child to its own invocation when run IDs overlap (${mode})`, async () => {
      const callbacks = CallbackManager.configure([]);
      assert.ok(callbacks);
      const serialized = echo().toJSON();
      const older = await callbacks.handleToolStart(serialized, '', 'reused');
      const newer = await callbacks.handleToolStart(serialized, '', 'reused');
      try {
        let childCallbacks = older.getChild();
        if (mode === 'copied') childCallbacks = childCallbacks.copy();
        if (mode === 'configured') {
          const configured = CallbackManager.configure(childCallbacks);
          assert.ok(configured);
          childCallbacks = configured;
        }
        if (mode === 'invoke') {
          assert.equal(
            await echo().invoke('child', { callbacks: childCallbacks }),
            'child'
          );
        } else {
          const child = await childCallbacks.handleToolStart(
            serialized,
            '',
            'child'
          );
          await child.handleToolEnd('child');
        }
        await older.handleToolEnd('older');
        await newer.handleToolEnd('newer');
        const spans = getTestSpans();
        assert.equal(spans.length, 3);
        assert.equal(
          spans[0].parentSpanContext?.spanId,
          spans[1].spanContext().spanId
        );
      } finally {
        await older.handleToolEnd('cleanup');
        await newer.handleToolEnd('cleanup');
      }
    });
  }

  for (const first of ['older', 'newer'] as const) {
    it(`keeps the surviving parent's invocation when the ${first} same-ID run completes`, async () => {
      const callbacks = CallbackManager.configure([]);
      assert.ok(callbacks);
      const serialized = echo().toJSON();
      const older = await callbacks.handleToolStart(serialized, '', 'reused');
      const newer = await callbacks.handleToolStart(serialized, '', 'reused');
      try {
        const completed = first === 'older' ? older : newer;
        const survivor = first === 'older' ? newer : older;
        await completed.handleToolEnd('completed');
        const child = await survivor
          .getChild()
          .handleToolStart(serialized, '', 'child');
        await child.handleToolEnd('child');
        await survivor.handleToolEnd('survivor');
        const spans = getTestSpans();
        assert.equal(spans.length, 3);
        assert.equal(
          spans[1].parentSpanContext?.spanId,
          spans[2].spanContext().spanId
        );
      } finally {
        await older.handleToolEnd('cleanup');
        await newer.handleToolEnd('cleanup');
      }
    });
  }

  it('retains the newest run-ID fallback until completion without inherited callbacks', async () => {
    const callbacks = CallbackManager.configure([]);
    assert.ok(callbacks);
    const serialized = echo().toJSON();
    const older = await callbacks.handleToolStart(serialized, '', 'reused');
    const newer = await callbacks.handleToolStart(serialized, '', 'reused');
    const childCallbacks = new CallbackManager('reused');
    const pending = [older, newer];
    try {
      await older.handleToolEnd('older');
      const child = await childCallbacks.handleToolStart(
        serialized,
        '',
        'child'
      );
      pending.push(child);
      await child.handleToolEnd('child');
      await newer.handleToolEnd('newer');
      const spans = getTestSpans();
      assert.equal(spans.length, 3);
      assert.equal(
        spans[1].parentSpanContext?.spanId,
        spans[2].spanContext().spanId
      );

      const independent = await childCallbacks.handleToolStart(
        serialized,
        '',
        'independent'
      );
      pending.push(independent);
      await independent.handleToolEnd('independent');
      assert.equal(getTestSpans().length, 4);
      assert.equal(getTestSpans()[3].parentSpanContext, undefined);
    } finally {
      await Promise.all(pending.map(run => run.handleToolEnd('cleanup')));
    }
  });

  for (const state of ['completed', 'failed', 'skipped'] as const) {
    it(`does not reparent a ${state} invocation's child to a reused run ID`, async function () {
      this.timeout(15000);
      const callbacks = CallbackManager.configure([]);
      assert.ok(callbacks);
      const serialized = echo().toJSON();
      const pending: Awaited<ReturnType<CallbackManager['handleToolStart']>>[] =
        [];
      try {
        if (state === 'skipped') {
          for (let index = 0; index < 1000; index++) {
            pending.push(
              await callbacks.handleToolStart(
                serialized,
                '',
                `pending-${index}`
              )
            );
          }
        }
        const older = await callbacks.handleToolStart(serialized, '', 'reused');
        pending.push(older);
        const childCallbacks = older.getChild();
        if (state === 'completed') {
          await older.handleToolEnd('older');
        } else if (state === 'failed') {
          await older.handleToolError(new Error('older-error'));
        } else {
          // Leave room for both the replacement and the skipped run's child.
          await pending[0].handleToolEnd('cleanup');
          await pending[1].handleToolEnd('cleanup');
        }
        const newer = await callbacks.handleToolStart(serialized, '', 'reused');
        pending.push(newer);
        const before = getTestSpans().length;
        const child = await childCallbacks.handleToolStart(
          serialized,
          '',
          'child'
        );
        pending.push(child);
        await child.handleToolEnd('child');
        await newer.handleToolEnd('newer');
        const spans = getTestSpans();
        assert.equal(spans.length, before + 2);
        assert.equal(spans[before].parentSpanContext, undefined);
      } finally {
        await Promise.all(pending.map(run => run.handleToolEnd('cleanup')));
      }
    });
  }

  it('does not pass an in-flight parent invocation to a child started while disabled', async () => {
    const runId = '00000000-0000-4000-8000-000000000001';
    const outer = new DynamicTool({
      name: 'outer',
      description: '',
      func: async (input, runManager) => {
        assert.ok(runManager);
        instrumentation.disable();
        await echo().invoke(input, {
          callbacks: runManager.getChild(),
          runId,
        });
        assert.equal(getTestSpans().length, 0);
        assert.deepEqual(await points(), []);
        return input;
      },
    });
    assert.equal(await outer.invoke('input', { runId }), 'input');
    assert.equal(getTestSpans().length, 1);
    assert.equal(getTestSpans()[0].name, 'execute_tool outer');
    assert.equal((await points())[0].value.count, 1);
  });

  it('keeps in-flight callbacks on their original provider and capture mode', async () => {
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    let enter!: () => void;
    let finish!: (value: string) => void;
    const started = new Promise<void>(resolve => {
      enter = resolve;
    });
    const pending = new Promise<string>(resolve => {
      finish = resolve;
    });
    const operation = new DynamicTool({
      name: 'pending',
      description: '',
      func: async () => {
        enter();
        return pending;
      },
    });
    const result = operation.invoke('input');
    await started;
    const exporter = new InMemorySpanExporter();
    const provider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
    });
    const nextReader = new TestMetricReader();
    const nextMeter = new MeterProvider({ readers: [nextReader] });
    try {
      instrumentation.setTracerProvider(provider);
      instrumentation.setMeterProvider(nextMeter);
      instrumentation.setConfig({ captureMessageContent: 'none' });
      instrumentation.disable();
      finish('output');
      assert.equal(await result, 'output');
      assert.equal(getTestSpans().length, 1);
      assert.equal(
        getTestSpans()[0].attributes['gen_ai.tool.call.result'],
        '{"output":"output"}'
      );
      assert.equal(exporter.getFinishedSpans().length, 0);
      assert.equal((await points())[0].value.count, 1);
      assert.deepEqual(
        (await nextReader.collect()).resourceMetrics.scopeMetrics,
        []
      );

      instrumentation.enable();
      await echo().invoke('next');
      const nextSpans = exporter.getFinishedSpans();
      assert.equal(nextSpans.length, 1);
      assert.equal(
        nextSpans[0].attributes['gen_ai.tool.call.arguments'],
        undefined
      );
      assert.equal(
        nextSpans[0].attributes['gen_ai.tool.call.result'],
        undefined
      );
      const scopes = (await nextReader.collect()).resourceMetrics.scopeMetrics;
      assert.equal(scopes.length, 1);
      assert.equal(
        scopes[0].scope.schemaUrl,
        nextSpans[0].instrumentationScope.schemaUrl
      );
      assert.equal(
        scopes[0].metrics[0].descriptor.name,
        'gen_ai.execute_tool.duration'
      );
      assert.equal(getTestSpans().length, 1);
      assert.equal((await points())[0].value.count, 1);
    } finally {
      await provider.shutdown();
      await nextMeter.shutdown();
    }
  });

  it('diagnoses unserializable output without replacing the SDK result', async () => {
    const warn = sinon.spy();
    diag.setLogger(
      { warn, error() {}, info() {}, debug() {}, verbose() {} },
      DiagLogLevel.WARN
    );
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    const output: { circular?: unknown } = {};
    output.circular = output;
    const operation = new DynamicStructuredTool({
      name: 'circular',
      description: '',
      schema: echo().schema.innerType().required(),
      func: async () => output,
    });
    assert.equal(await operation.invoke({ input: '' }), output);
    assert.equal(
      getTestSpans()[0].attributes['gen_ai.tool.call.result'],
      undefined
    );
    assert.ok(warn.called);
  });
});
