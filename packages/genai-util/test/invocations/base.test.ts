/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  SpanKind,
  SpanStatusCode,
  context,
  trace,
  type HrTime,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  hrTimeToMicroseconds,
  hrTimeToMilliseconds,
} from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { TelemetryHandler } from '../../src/handler';
import { BaseInvocation } from '../../src/invocations/base';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('BaseInvocation', () => {
  let ctx: TestTelemetryContext;
  let handler: TelemetryHandler;
  const contextManager = new AsyncLocalStorageContextManager();

  before(() => {
    context.setGlobalContextManager(contextManager.enable());
  });

  after(() => {
    context.disable();
  });

  beforeEach(() => {
    ctx = createTestTelemetryContext();
    handler = new TelemetryHandler({
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  class CustomInvocation extends BaseInvocation {
    public recordMetricsCalls: Array<{ durationSec: number; error?: unknown }> =
      [];
    public emitContentEventsCalls: Array<{ endTime?: HrTime }> = [];
    public runCompletionHookCalls: Array<{
      durationSec: number;
      error?: Error;
      spanIsRecording?: boolean;
    }> = [];

    protected override _recordMetrics(
      durationSec: number,
      error?: unknown
    ): void {
      this.recordMetricsCalls.push({ durationSec, error });
    }

    protected override _emitContentEvents(endTime?: HrTime): void {
      this.emitContentEventsCalls.push({ endTime });
    }

    protected override _runCompletionHook(
      durationSec: number,
      error?: Error
    ): void {
      this.runCompletionHookCalls.push({
        durationSec,
        error,
        spanIsRecording: this._span.isRecording(),
      });
    }
  }

  it('should start the span on construction with the given name, kind and attributes', () => {
    const inv = new CustomInvocation('custom-span', handler, {
      kind: SpanKind.INTERNAL,
      attributes: { 'gen_ai.operation.name': 'chat' },
    });

    // The span is started, but not ended, by the constructor.
    assert.strictEqual(inv.isEnded(), false);
    assert.ok(inv.getSpan().isRecording());
    assert.strictEqual(ctx.memoryExporter.getFinishedSpans().length, 0);
    assert.strictEqual(
      trace.getSpan(inv.getContext()),
      inv.getSpan(),
      'getContext() should contain the invocation span'
    );

    inv.stop();

    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.name, 'custom-span');
    assert.strictEqual(span.kind, SpanKind.INTERNAL);
    assert.strictEqual(span.attributes['gen_ai.operation.name'], 'chat');
    assert.strictEqual(inv.isEnded(), true);
  });

  it('should default the span kind to CLIENT', () => {
    new CustomInvocation('default-kind-span', handler).stop();

    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.kind, SpanKind.CLIENT);
  });

  it('should manage lifecycle and attributes correctly and execute all hooks on stop', () => {
    const inv = new CustomInvocation('custom-span', handler);

    inv.setAttribute('custom.attr', 'value1');
    inv.setAttributes({ 'custom.attr2': 'value2' });

    inv.stop();
    // Double stop should be a no-op
    inv.stop();

    // Verify hooks called once with correct parameters
    assert.strictEqual(inv.recordMetricsCalls.length, 1);
    assert.strictEqual(typeof inv.recordMetricsCalls[0].durationSec, 'number');
    assert.ok(inv.recordMetricsCalls[0].durationSec >= 0);
    assert.strictEqual(inv.recordMetricsCalls[0].error, undefined);

    assert.strictEqual(inv.emitContentEventsCalls.length, 1);
    assert.ok(Array.isArray(inv.emitContentEventsCalls[0].endTime));
    assert.strictEqual(inv.emitContentEventsCalls[0].endTime?.length, 2);

    assert.strictEqual(inv.runCompletionHookCalls.length, 1);
    assert.strictEqual(
      typeof inv.runCompletionHookCalls[0].durationSec,
      'number'
    );
    assert.ok(inv.runCompletionHookCalls[0].durationSec >= 0);
    assert.strictEqual(inv.runCompletionHookCalls[0].error, undefined);
    assert.strictEqual(inv.runCompletionHookCalls[0].spanIsRecording, true);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
    assert.strictEqual(spans[0].attributes['custom.attr'], 'value1');
    assert.strictEqual(spans[0].attributes['custom.attr2'], 'value2');
  });

  it('should handle fail lifecycle with error and execute all hooks on fail with double fail protection', () => {
    const inv = new CustomInvocation('custom-fail-span', handler);

    const testError = new Error('Test failure');
    inv.fail(testError);
    // Double fail should be a no-op
    inv.fail(new Error('Second failure'));

    // Verify hooks called once with error and duration
    assert.strictEqual(inv.recordMetricsCalls.length, 1);
    assert.strictEqual(inv.recordMetricsCalls[0].error, testError);
    assert.strictEqual(typeof inv.recordMetricsCalls[0].durationSec, 'number');
    assert.ok(inv.recordMetricsCalls[0].durationSec >= 0);

    assert.strictEqual(inv.emitContentEventsCalls.length, 1);
    assert.ok(Array.isArray(inv.emitContentEventsCalls[0].endTime));
    assert.strictEqual(inv.emitContentEventsCalls[0].endTime?.length, 2);

    assert.strictEqual(inv.runCompletionHookCalls.length, 1);
    assert.strictEqual(inv.runCompletionHookCalls[0].error, testError);
    assert.strictEqual(
      typeof inv.runCompletionHookCalls[0].durationSec,
      'number'
    );
    assert.ok(inv.runCompletionHookCalls[0].durationSec >= 0);
    assert.strictEqual(inv.runCompletionHookCalls[0].spanIsRecording, true);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(spans[0].status.message, 'Test failure');
    assert.strictEqual(spans[0].attributes[ATTR_ERROR_TYPE], 'Error');
  });

  it('should handle custom explicit endTime array and string errors', () => {
    const inv = new CustomInvocation('custom-endtime-span', handler);

    const customEndTime: HrTime = [1000, 500000000];
    inv.fail('String error message', customEndTime);

    assert.strictEqual(inv.recordMetricsCalls.length, 1);
    assert.strictEqual(inv.recordMetricsCalls[0].error, 'String error message');

    assert.strictEqual(inv.emitContentEventsCalls.length, 1);
    assert.deepStrictEqual(
      inv.emitContentEventsCalls[0].endTime,
      customEndTime
    );

    assert.strictEqual(inv.runCompletionHookCalls.length, 1);
    assert.strictEqual(
      inv.runCompletionHookCalls[0].error?.message,
      'String error message'
    );
    assert.ok(inv.runCompletionHookCalls[0].error instanceof Error);
    assert.strictEqual(inv.runCompletionHookCalls[0].spanIsRecording, true);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(spans[0].status.message, 'String error message');
    assert.strictEqual(spans[0].attributes[ATTR_ERROR_TYPE], '_OTHER');
  });

  it('should accept Date and number TimeInput for startTime and endTime', () => {
    const startDate = new Date(1700000000000);
    const endDate = new Date(1700000005000);
    const inv = new CustomInvocation('date-time-span', handler, {
      startTime: startDate,
    });

    inv.stop(endDate);

    assert.strictEqual(inv.recordMetricsCalls.length, 1);
    assert.strictEqual(inv.recordMetricsCalls[0].durationSec, 5);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
    assert.strictEqual(
      hrTimeToMilliseconds(spans[0].startTime),
      startDate.getTime()
    );
    assert.strictEqual(
      hrTimeToMilliseconds(spans[0].endTime),
      endDate.getTime()
    );
  });

  it('should export span with endTime after startTime and non-zero positive duration', async () => {
    const inv = new CustomInvocation('timing-span', handler);

    // Wait a brief moment to ensure a measurable elapsed duration
    await new Promise(resolve => setTimeout(resolve, 10));
    inv.stop();

    const [finishedSpan] = ctx.memoryExporter.getFinishedSpans();
    assert.ok(finishedSpan);

    const startMs = hrTimeToMilliseconds(finishedSpan.startTime);
    const endMs = hrTimeToMilliseconds(finishedSpan.endTime);
    const durationMs = hrTimeToMilliseconds(finishedSpan.duration);

    // End time must be at or after start time and anchored in modern Unix epoch (not year 1970)
    assert.ok(
      startMs > 1_000_000_000_000,
      `Expected startMs (${startMs}) to be modern epoch timestamp`
    );
    assert.ok(
      endMs >= startMs,
      `Expected endMs (${endMs}) to be >= startMs (${startMs})`
    );
    assert.ok(
      hrTimeToMicroseconds(finishedSpan.startTime) <=
        hrTimeToMicroseconds(finishedSpan.endTime)
    );
    assert.ok(durationMs > 0, `Expected durationMs (${durationMs}) to be > 0`);
  });

  it('should allow modifying span attributes inside completion hook before span ends', () => {
    class EnrichingInvocation extends BaseInvocation {
      protected override _runCompletionHook(): void {
        this._span.setAttribute('hook.enriched', 'true');
      }
    }

    const inv = new EnrichingInvocation('enriching-span', handler);
    inv.stop();

    const [finishedSpan] = ctx.memoryExporter.getFinishedSpans();
    assert.ok(finishedSpan);
    assert.strictEqual(finishedSpan.attributes['hook.enriched'], 'true');
    assert.strictEqual(finishedSpan.status.code, SpanStatusCode.UNSET);
  });

  it('should guarantee span is ended even if completion hook throws on stop or fail', () => {
    class ThrowingInvocation extends BaseInvocation {
      protected override _runCompletionHook(): void {
        throw new Error('Hook failure');
      }
    }

    // Test stop() with throwing hook
    const stopInv = new ThrowingInvocation('throwing-stop-span', handler);
    assert.throws(() => stopInv.stop(), /Hook failure/);

    // Test fail() with throwing hook
    const failInv = new ThrowingInvocation('throwing-fail-span', handler);
    assert.throws(
      () => failInv.fail(new Error('Original failure')),
      /Hook failure/
    );

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);

    const finishedStopSpan = spans.find(s => s.name === 'throwing-stop-span');
    assert.ok(finishedStopSpan);
    assert.strictEqual(finishedStopSpan.status.code, SpanStatusCode.UNSET);

    const finishedFailSpan = spans.find(s => s.name === 'throwing-fail-span');
    assert.ok(finishedFailSpan);
    assert.strictEqual(finishedFailSpan.status.code, SpanStatusCode.ERROR);
    assert.strictEqual(finishedFailSpan.status.message, 'Original failure');
  });

  describe('context management', () => {
    it('should parent the invocation span to the active span by default', () => {
      const tracer = ctx.tracerProvider.getTracer('test-tracer');
      const parentSpan = tracer.startSpan('parent-span');

      context.with(trace.setSpan(context.active(), parentSpan), () => {
        new CustomInvocation('child-invocation', handler).stop();
      });
      parentSpan.end();

      const child = ctx.memoryExporter
        .getFinishedSpans()
        .find(s => s.name === 'child-invocation');
      assert.ok(child);
      assert.strictEqual(
        child.parentSpanContext?.spanId,
        parentSpan.spanContext().spanId
      );
      assert.strictEqual(
        child.spanContext().traceId,
        parentSpan.spanContext().traceId
      );
    });

    it('should parent the invocation span to an explicit parentContext', () => {
      const tracer = ctx.tracerProvider.getTracer('test-tracer');
      const parentSpan = tracer.startSpan('explicit-parent-span');
      const parentContext = trace.setSpan(context.active(), parentSpan);

      new CustomInvocation('explicit-child-invocation', handler, {
        parentContext,
      }).stop();
      parentSpan.end();

      const child = ctx.memoryExporter
        .getFinishedSpans()
        .find(s => s.name === 'explicit-child-invocation');
      assert.ok(child);
      assert.strictEqual(
        child.parentSpanContext?.spanId,
        parentSpan.spanContext().spanId
      );
    });

    it('withContext() should not leak the invocation context to the caller', () => {
      const inv = new CustomInvocation('scoped-span', handler);

      inv.withContext(invocation => {
        assert.strictEqual(invocation, inv);
        assert.strictEqual(trace.getSpan(context.active()), inv.getSpan());
      });

      assert.strictEqual(
        trace.getSpan(context.active()),
        undefined,
        'the invocation context must not leak outside of withContext()'
      );

      inv.stop();
    });

    it('withContext() should keep the context active across awaits in an async callback', async () => {
      const inv = new CustomInvocation('async-context-span', handler);

      const result = await inv.withContext(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        // The context survives the await point inside the callback.
        assert.strictEqual(trace.getSpan(context.active()), inv.getSpan());
        ctx.tracerProvider
          .getTracer('test-tracer')
          .startSpan('after-await')
          .end();
        return 42;
      });

      assert.strictEqual(result, 42);
      // The invocation is still open: the caller decides when it ends.
      assert.strictEqual(inv.isEnded(), false);
      assert.strictEqual(
        trace.getSpan(context.active()),
        undefined,
        'code after the awaited callback runs outside the invocation context'
      );

      inv.stop();

      const child = ctx.memoryExporter
        .getFinishedSpans()
        .find(s => s.name === 'after-await');
      assert.ok(child);
      assert.strictEqual(
        child.parentSpanContext?.spanId,
        inv.getSpan().spanContext().spanId
      );
    });

    it('should automatically nest invocations created inside withContext()', async () => {
      const outer = new CustomInvocation('outer-invocation', handler);

      await outer.withContext(async () => {
        const inner = new CustomInvocation('inner-invocation', handler);
        await new Promise(resolve => setTimeout(resolve, 1));
        inner.stop();
      });
      outer.stop();

      const spans = ctx.memoryExporter.getFinishedSpans();
      const innerSpan = spans.find(s => s.name === 'inner-invocation');
      const outerSpan = spans.find(s => s.name === 'outer-invocation');
      assert.ok(innerSpan);
      assert.ok(outerSpan);
      assert.strictEqual(
        innerSpan.parentSpanContext?.spanId,
        outerSpan.spanContext().spanId
      );
      // Inner invocations must end before their parent.
      assert.ok(
        hrTimeToMicroseconds(innerSpan.endTime) <=
          hrTimeToMicroseconds(outerSpan.endTime)
      );
    });

    it('withContext() should activate the context without ending the invocation', () => {
      const inv = new CustomInvocation('with-context-span', handler);

      const result = inv.withContext(invocation => {
        assert.strictEqual(invocation, inv);
        ctx.tracerProvider
          .getTracer('test-tracer')
          .startSpan('deferred-child')
          .end();
        return 'still open';
      });

      assert.strictEqual(result, 'still open');
      assert.strictEqual(inv.isEnded(), false);
      assert.strictEqual(
        ctx.memoryExporter.getFinishedSpans().length,
        1,
        'only the child span should have ended'
      );

      inv.stop();

      const spans = ctx.memoryExporter.getFinishedSpans();
      const child = spans.find(s => s.name === 'deferred-child');
      assert.ok(child);
      assert.strictEqual(
        child.parentSpanContext?.spanId,
        inv.getSpan().spanContext().spanId
      );
      assert.strictEqual(spans.length, 2);
    });
  });
});
