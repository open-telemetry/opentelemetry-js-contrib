/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { SpanStatusCode, type HrTime } from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { BaseInvocation } from '../../src';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from '../helpers/test-setup';

describe('BaseInvocation', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
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
      error?: unknown;
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
      error?: unknown
    ): void {
      this.runCompletionHookCalls.push({ durationSec, error });
    }
  }

  it('should manage lifecycle and attributes correctly and execute all hooks on stop', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const span = tracer.startSpan('custom-span');
    const inv = new CustomInvocation(span);

    assert.strictEqual(inv.getSpan(), span);
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

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
    assert.strictEqual(spans[0].attributes['custom.attr'], 'value1');
    assert.strictEqual(spans[0].attributes['custom.attr2'], 'value2');
  });

  it('should handle fail lifecycle with error and execute all hooks on fail with double fail protection', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const span = tracer.startSpan('custom-fail-span');
    const inv = new CustomInvocation(span);

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

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(spans[0].status.message, 'Test failure');
    assert.strictEqual(spans[0].attributes[ATTR_ERROR_TYPE], 'Error');
  });

  it('should handle custom explicit endTime array and string errors', () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    const span = tracer.startSpan('custom-endtime-span');
    const inv = new CustomInvocation(span);

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
      inv.runCompletionHookCalls[0].error,
      'String error message'
    );

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
    assert.strictEqual(spans[0].status.message, 'String error message');
    assert.strictEqual(
      spans[0].attributes[ATTR_ERROR_TYPE],
      'String error message'
    );
  });
});
