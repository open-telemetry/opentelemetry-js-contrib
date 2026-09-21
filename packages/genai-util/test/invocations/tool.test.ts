/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { SpanStatusCode, type Attributes } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SamplingDecision,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { TelemetryHandler } from '../../src/handler';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  METRIC_GEN_AI_EXECUTE_TOOL_DURATION,
} from '../../src/semconv';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('ToolInvocation', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  it('should handle tool execution spans', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      contentCaptureMode: 'span_only',
    });

    const invocation = handler.startTool({
      toolName: 'get_stock_price',
      toolDescription: 'Fetch stock price for a symbol',
      toolCallId: 'call_123',
      toolType: 'function',
      toolArguments: { symbol: 'AAPL' },
    });

    invocation.setResult({ price: 150.25 });
    invocation.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.name, 'execute_tool get_stock_price');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      'execute_tool'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_TOOL_NAME],
      'get_stock_price'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_TOOL_DESCRIPTION],
      'Fetch stock price for a symbol'
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_TOOL_CALL_ID], 'call_123');
    assert.strictEqual(span.attributes[ATTR_GEN_AI_TOOL_TYPE], 'function');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
      '{"symbol":"AAPL"}'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      '{"price":150.25}'
    );
    // `stop()` leaves the span status UNSET: only failures set an explicit status.
    assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
  });

  // Tool calls executed within agentic workflows may receive or return complex runtime
  // objects (e.g. database connections, context states, or models with cyclic references).
  // Using standard JSON.stringify without error handling throws an unhandled TypeError.
  // This test ensures ToolInvocation safely handles cyclic references without crashing.
  it('should handle non-serializable and circular arguments and results safely', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      contentCaptureMode: 'span_only',
    });

    const circularArgs: any = { a: 1 };
    circularArgs.self = circularArgs;

    const invocation = handler.startTool({
      toolName: 'complex_tool',
      toolArguments: circularArgs,
    });

    const circularResult: any = { b: 2 };
    circularResult.self = circularResult;

    invocation.setResult(circularResult);
    invocation.stop();

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
      '[object Object]'
    );
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      '[object Object]'
    );
    // `stop()` leaves the span status UNSET: only failures set an explicit status.
    assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
  });

  it('should respect content capture mode (none vs span_only)', () => {
    // 1. Mode: none
    const handlerNone = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      contentCaptureMode: 'none',
    });
    const invNone = handlerNone.startTool({
      toolName: 'calc',
      toolArguments: { x: 1 },
    });
    invNone.setResult({ y: 2 });
    invNone.stop();

    const spansNone = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spansNone.length, 1);
    assert.strictEqual(
      spansNone[0].attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
      undefined
    );
    assert.strictEqual(
      spansNone[0].attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      undefined
    );
    assert.strictEqual(spansNone[0].events.length, 0);

    ctx.reset();

    // 2. Mode: span_only
    const handlerSpan = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      contentCaptureMode: 'span_only',
    });
    const invSpan = handlerSpan.startTool({
      toolName: 'calc',
      toolArguments: { x: 1 },
    });
    invSpan.setResult({ y: 2 });
    invSpan.stop();

    const spansSpan = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spansSpan.length, 1);
    assert.strictEqual(
      spansSpan[0].attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
      '{"x":1}'
    );
    assert.strictEqual(
      spansSpan[0].attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      '{"y":2}'
    );
    assert.strictEqual(spansSpan[0].events.length, 0);
  });

  it('should preserve tool call arguments in span attributes when tool execution fails', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      contentCaptureMode: 'span_only',
    });

    const toolInv = handler.startTool({
      toolName: 'calculator',
      toolDescription: 'Performs math',
      toolCallId: 'call_999',
      toolArguments: { expr: '1/0' },
    });
    toolInv.setAttribute('custom', 'val');
    toolInv.fail(new Error('Division by zero'));

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];

    assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(span.status.message, 'Division by zero');
    assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');
    assert.strictEqual(span.attributes[ATTR_GEN_AI_TOOL_NAME], 'calculator');
    assert.strictEqual(span.attributes[ATTR_GEN_AI_TOOL_CALL_ID], 'call_999');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
      '{"expr":"1/0"}'
    );
    // No result was ever set here; the suppression of a result that *was* set is
    // covered separately below.
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      undefined
    );
  });

  // `gen_ai.tool.call.result` is defined as the result of a *successful* execution, so
  // the attribute is buffered by `setResult` and only written once the invocation is
  // known to have succeeded.
  describe('gen_ai.tool.call.result', () => {
    function createHandler(): TelemetryHandler {
      return new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        contentCaptureMode: 'span_only',
      });
    }

    it('should record a result that was set before a successful stop', () => {
      const inv = createHandler().startTool({ toolName: 'calculator' });

      inv.setResult({ value: 42 });
      inv.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
        '{"value":42}'
      );
    });

    it('should suppress a result that was set before the execution failed', () => {
      const inv = createHandler().startTool({
        toolName: 'calculator',
        toolArguments: { expr: '1/0' },
      });

      // A caller may optimistically record a partial result and only discover the
      // failure afterwards; the attribute must not survive that.
      inv.setResult({ value: 42 });
      inv.fail(new RangeError('Division by zero'));

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
        undefined
      );
      // Arguments and error details are still reported: only the result is dropped.
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS],
        '{"expr":"1/0"}'
      );
      assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'RangeError');
    });

    it('should keep the result readable via getResult() after a failure', () => {
      const inv = createHandler().startTool({ toolName: 'calculator' });

      inv.setResult({ value: 42 });
      inv.fail(new Error('boom'));

      // Suppression applies to the recorded attribute, not to the in-memory value that
      // completion hooks and callers may still inspect.
      assert.deepStrictEqual(inv.getResult(), { value: 42 });
    });

    it('should not record a result when content capture is disabled', () => {
      const handler = new TelemetryHandler({
        instrumentationName: 'test-instrumentation',
        instrumentationVersion: '1.0.0',
        tracerProvider: ctx.tracerProvider,
        contentCaptureMode: 'none',
      });
      const inv = handler.startTool({ toolName: 'calculator' });

      inv.setResult({ value: 42 });
      inv.stop();

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(
        span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
        undefined
      );
    });
  });

  it('should record gen_ai.agent.name and gen_ai.conversation.id on the span', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
    });

    handler
      .startTool({
        toolName: 'get_weather',
        agentName: 'Math Tutor',
        conversationId: 'conv_5j66UpCpwteGg4YSxUnt7lPY',
      })
      .stop();

    const span = ctx.memoryExporter.getFinishedSpans()[0];
    assert.strictEqual(span.attributes[ATTR_GEN_AI_AGENT_NAME], 'Math Tutor');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_CONVERSATION_ID],
      'conv_5j66UpCpwteGg4YSxUnt7lPY'
    );
  });

  // `gen_ai.agent.name` and `gen_ai.operation.name` are listed by the semantic conventions
  // as attributes that SHOULD be available at span creation time so that samplers can act
  // on them, so they must not be added after the span has started.
  it('should provide sampling-relevant attributes at span creation time', () => {
    const seen: Attributes[] = [];
    const samplingTracerProvider = new TracerProvider({
      spanProcessors: [
        new SimpleSpanProcessor({ exporter: new InMemorySpanExporter() }),
      ],
      sampler: {
        shouldSample(_ctx, _traceId, _name, _kind, attributes) {
          seen.push(attributes);
          return { decision: SamplingDecision.RECORD_AND_SAMPLED };
        },
        toString: () => 'CapturingSampler',
      },
    });

    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: samplingTracerProvider,
    });

    handler
      .startTool({ toolName: 'get_weather', agentName: 'Math Tutor' })
      .stop();

    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0][ATTR_GEN_AI_AGENT_NAME], 'Math Tutor');
    assert.strictEqual(seen[0][ATTR_GEN_AI_OPERATION_NAME], 'execute_tool');
    assert.strictEqual(seen[0][ATTR_GEN_AI_TOOL_NAME], 'get_weather');
  });

  it('should keep the span name and operation name in sync when overridden', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
    });

    handler
      .startTool({ toolName: 'get_weather', operationName: 'invoke_tool' })
      .stop();

    const span = ctx.memoryExporter.getFinishedSpans()[0];
    assert.strictEqual(span.name, 'invoke_tool get_weather');
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      'invoke_tool'
    );
  });

  // The required `gen_ai.operation.name` / `gen_ai.tool.name` must survive a caller that
  // passes conflicting keys through the generic `attributes` escape hatch.
  it('should not let custom attributes override required semconv attributes', () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
    });

    handler
      .startTool({
        toolName: 'get_weather',
        attributes: {
          [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
          [ATTR_GEN_AI_TOOL_NAME]: 'something_else',
          'custom.attr': 'kept',
        },
      })
      .stop();

    const span = ctx.memoryExporter.getFinishedSpans()[0];
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_OPERATION_NAME],
      'execute_tool'
    );
    assert.strictEqual(span.attributes[ATTR_GEN_AI_TOOL_NAME], 'get_weather');
    assert.strictEqual(span.attributes['custom.attr'], 'kept');
  });

  it('should record the gen_ai.execute_tool.duration metric', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    handler
      .startTool({
        toolName: 'get_weather',
        toolType: 'function',
        agentName: 'Math Tutor',
      })
      .stop();

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    const durationMetric = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_EXECUTE_TOOL_DURATION
    );

    assert.ok(durationMetric, 'gen_ai.execute_tool.duration was not recorded');
    assert.strictEqual(durationMetric.descriptor.unit, 's');

    const dataPoint = durationMetric.dataPoints[0];
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_TOOL_NAME],
      'get_weather'
    );
    assert.strictEqual(dataPoint.attributes[ATTR_GEN_AI_TOOL_TYPE], 'function');
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_AGENT_NAME],
      'Math Tutor'
    );
    assert.strictEqual(dataPoint.attributes[ATTR_ERROR_TYPE], undefined);
  });

  it('should record error.type on the duration metric when the tool fails', async () => {
    const handler = new TelemetryHandler({
      instrumentationName: 'test-instrumentation',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    handler
      .startTool({ toolName: 'calculator' })
      .fail(new RangeError('Division by zero'));

    const { resourceMetrics } = await ctx.metricReader.collect();
    const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    const durationMetric = metrics.find(
      m => m.descriptor.name === METRIC_GEN_AI_EXECUTE_TOOL_DURATION
    );
    assert.ok(durationMetric);

    const dataPoint = durationMetric.dataPoints[0];
    assert.strictEqual(
      dataPoint.attributes[ATTR_GEN_AI_TOOL_NAME],
      'calculator'
    );
    // The metric must report the same `error.type` as the span, not `_OTHER`.
    assert.strictEqual(dataPoint.attributes[ATTR_ERROR_TYPE], 'RangeError');
    assert.strictEqual(
      ctx.memoryExporter.getFinishedSpans()[0].attributes[ATTR_ERROR_TYPE],
      'RangeError'
    );
  });
});
