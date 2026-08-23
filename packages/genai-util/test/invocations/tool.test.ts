/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { SpanStatusCode } from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { TelemetryHandler } from '../../src/handler';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
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
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({
      tracer,
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
    assert.strictEqual(span.status.code, SpanStatusCode.OK);
  });

  // Tool calls executed within agentic workflows may receive or return complex runtime
  // objects (e.g. database connections, context states, or models with cyclic references).
  // Using standard JSON.stringify without error handling throws an unhandled TypeError.
  // This test ensures ToolInvocation safely handles cyclic references without crashing.
  it('should handle non-serializable and circular arguments and results safely', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({
      tracer,
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
    assert.strictEqual(span.status.code, SpanStatusCode.OK);
  });

  it('should respect content capture mode (none vs span_only)', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');

    // 1. Mode: none
    const handlerNone = new TelemetryHandler({
      tracer,
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
      tracer,
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
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const handler = new TelemetryHandler({
      tracer,
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
    assert.strictEqual(
      span.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT],
      undefined
    );

    // Only exception event should be recorded
    assert.strictEqual(span.events.length, 1);
    assert.strictEqual(span.events[0].name, 'exception');
  });
});
