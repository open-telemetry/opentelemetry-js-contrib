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
import { CallbackManager } from '@langchain/core/callbacks/manager';
import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import {
  DynamicTool,
  DynamicStructuredTool,
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
      instrumentation.setConfig({ captureMessageContent: capture });
      const sourceTool = tool(async () => 'this is a test tool', {
        name: 'test_tool',
        description: 'Local donated scenario',
      });
      assert.equal(await sourceTool.invoke('hello'), 'this is a test tool');
      const spans = getTestSpans();
      assert.equal(spans.length, 1);
      assert.equal(spans[0].name, 'execute_tool test_tool');
      assert.equal(spans[0].kind, SpanKind.INTERNAL);
      assert.deepEqual(spans[0].status, { code: SpanStatusCode.UNSET });
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

  for (const output of ['text', ['one', 'two'], 0, false, null, undefined]) {
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

  for (const mode of ['none', 'array', 'manager', 'local-manager'] as const) {
    it(`preserves user callbacks and registers once (${mode})`, async () => {
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
      instrumentation.disable();
      for (let index = 0; index < 2; index++) {
        await operation.invoke('hello', { callbacks });
      }
      await awaitAllCallbacks();
      const startCount = start.callCount;
      const endCount = end.callCount;
      start.resetHistory();
      end.resetHistory();
      instrumentation.enable();
      for (let index = 0; index < 2; index++) {
        await operation.invoke('hello', { callbacks });
      }
      await awaitAllCallbacks();
      assert.equal(getTestSpans().length, 2);
      assert.deepEqual(array, [methods]);
      assert.deepEqual(manager.handlers, handlers);
      assert.equal(start.callCount, startCount);
      assert.equal(end.callCount, endCount);
    });
  }

  it('does not duplicate handlers inherited from an already configured manager', async () => {
    const callbacks = CallbackManager.configure();
    assert.ok(callbacks);
    const before = callbacks.handlers.slice();
    const operation = echo();
    operation.callbacks = callbacks;
    await operation.invoke('hello', { callbacks });
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
    instrumentation.disable();
    await echo().invoke('hello');
    instrumentation.enable();
    await context.with(suppressTracing(context.active()), () =>
      echo().invoke('hello')
    );
    assert.equal(getTestSpans().length, 0);
    assert.deepEqual(await points(), []);
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

  it('caps pending runs at 1000 and ignores late completion after eviction', async function () {
    this.timeout(15000);
    const warn = sinon.spy();
    diag.setLogger(
      { warn, error() {}, info() {}, debug() {}, verbose() {} },
      DiagLogLevel.WARN
    );
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    const releases: Array<() => void> = [];
    const results: Array<Promise<string>> = [];
    let entered: () => void;
    const operation = new DynamicTool({
      name: 'pending',
      description: '',
      func: input =>
        new Promise<string>(resolve => {
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
            runName: `pending-${index}`,
          })
        );
        await started;
        assert.equal(getTestSpans().length, Math.max(0, index + 1 - 1000));
      }
      assert.deepEqual(
        getTestSpans().map(span => span.name),
        [
          'execute_tool pending-0',
          'execute_tool pending-1',
          'execute_tool pending-2',
        ]
      );
      for (const span of getTestSpans()) {
        assert.equal(span.status.code, SpanStatusCode.UNSET);
        assert.equal(span.attributes['error.type'], undefined);
        assert.equal(span.attributes['gen_ai.tool.call.result'], undefined);
        assert.deepEqual(span.events, []);
      }
      assert.deepEqual(await points(), []);
      assert.equal(warn.callCount, 3);
      assert.equal(JSON.stringify(warn.args).includes('private-input'), false);
      for (const release of releases.slice(0, 3)) release();
      assert.deepEqual(await Promise.all(results.slice(0, 3)), [
        'private-input-0',
        'private-input-1',
        'private-input-2',
      ]);
      assert.equal(getTestSpans().length, 3);
      assert.deepEqual(await points(), []);
    } finally {
      for (const release of releases) release();
      await Promise.all(results);
    }
    assert.equal(getTestSpans().length, 1003);
    const recorded = await points();
    assert.equal(
      recorded.reduce((count, point) => count + point.value.count, 0),
      1000
    );
    assert.ok(
      recorded.every(
        point =>
          !['pending-0', 'pending-1', 'pending-2'].includes(
            String(point.attributes['gen_ai.tool.name'])
          )
      )
    );
    assert.equal(warn.callCount, 3);
  });

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
    try {
      instrumentation.setTracerProvider(provider);
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
    } finally {
      await provider.shutdown();
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
