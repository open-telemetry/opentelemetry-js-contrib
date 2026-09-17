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
  type Attributes,
  type HrTime,
  type Span,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  hrTimeToMicroseconds,
  hrTimeToMilliseconds,
} from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { TelemetryHandler } from '../../src/handler';
import {
  BaseInvocation,
  type BaseInvocationOptions,
} from '../../src/invocations/base';
import {
  ATTR_GEN_AI_TOKEN_TYPE,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
} from '../../src/semconv';
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
      instrumentationName: '@opentelemetry/instrumentation-test-genai',
      instrumentationVersion: '9.9.9',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  class CustomInvocation extends BaseInvocation {
    constructor(
      spanName: string,
      handler: TelemetryHandler,
      options: Partial<BaseInvocationOptions> = {}
    ) {
      super(spanName, handler, {
        ...options,
        kind: options.kind ?? SpanKind.CLIENT,
      });
    }

    /** Test-only accessor: the production class deliberately does not expose its span. */
    public getSpan(): Span {
      return this._span;
    }

    public recordMetricsCalls: Array<{
      durationSec: number;
      error?: unknown;
      metricAttributes: Attributes;
    }> = [];
    public emitContentEventCalls: Array<{ endTime?: HrTime }> = [];

    protected override _recordMetrics(
      durationSec: number,
      error?: unknown
    ): void {
      // Snapshot the attributes as they stand when metrics are recorded.
      this.recordMetricsCalls.push({
        durationSec,
        error,
        metricAttributes: { ...this._metricAttributes },
      });
    }

    protected override _emitContentEvent(endTime?: HrTime): void {
      this.emitContentEventCalls.push({ endTime });
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

    inv.stop();

    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.name, 'custom-span');
    assert.strictEqual(span.kind, SpanKind.INTERNAL);
    assert.strictEqual(span.attributes['gen_ai.operation.name'], 'chat');
    assert.strictEqual(inv.isEnded(), true);
  });

  it('should use the span kind supplied by the concrete invocation', () => {
    new CustomInvocation('subclass-kind-span', handler).stop();

    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.kind, SpanKind.CLIENT);
  });

  it('should complete normally when the subclass overrides no extension point', () => {
    // _recordMetrics and _emitContentEvent are optional: the base defaults are no-ops.
    class MinimalInvocation extends BaseInvocation {}

    const inv = new MinimalInvocation('minimal-span', handler, {
      kind: SpanKind.CLIENT,
    });
    inv.stop();

    const [span] = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(span.name, 'minimal-span');
    assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
    assert.strictEqual(inv.isEnded(), true);
  });

  it('should manage lifecycle and attributes correctly on stop', () => {
    const inv = new CustomInvocation('custom-span', handler);

    inv.setAttribute('custom.attr', 'value1');
    inv.setAttributes({ 'custom.attr2': 'value2' });

    inv.stop();
    // Double stop should be a no-op
    inv.stop();

    // Verify the extension points ran exactly once with correct parameters
    assert.strictEqual(inv.recordMetricsCalls.length, 1);
    assert.strictEqual(typeof inv.recordMetricsCalls[0].durationSec, 'number');
    assert.ok(inv.recordMetricsCalls[0].durationSec >= 0);
    assert.strictEqual(inv.recordMetricsCalls[0].error, undefined);

    assert.strictEqual(inv.emitContentEventCalls.length, 1);
    assert.ok(Array.isArray(inv.emitContentEventCalls[0].endTime));
    assert.strictEqual(inv.emitContentEventCalls[0].endTime?.length, 2);

    const spans = ctx.memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].status.code, SpanStatusCode.UNSET);
    assert.strictEqual(spans[0].attributes['custom.attr'], 'value1');
    assert.strictEqual(spans[0].attributes['custom.attr2'], 'value2');
  });

  it('should handle fail lifecycle with error and double fail protection', () => {
    const inv = new CustomInvocation('custom-fail-span', handler);

    const testError = new Error('Test failure');
    inv.fail(testError);
    // Double fail should be a no-op
    inv.fail(new Error('Second failure'));

    // Verify the extension points ran exactly once with error and duration
    assert.strictEqual(inv.recordMetricsCalls.length, 1);
    assert.strictEqual(inv.recordMetricsCalls[0].error, testError);
    assert.strictEqual(typeof inv.recordMetricsCalls[0].durationSec, 'number');
    assert.ok(inv.recordMetricsCalls[0].durationSec >= 0);

    assert.strictEqual(inv.emitContentEventCalls.length, 1);
    assert.ok(Array.isArray(inv.emitContentEventCalls[0].endTime));
    assert.strictEqual(inv.emitContentEventCalls[0].endTime?.length, 2);

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

    assert.strictEqual(inv.emitContentEventCalls.length, 1);
    assert.deepStrictEqual(inv.emitContentEventCalls[0].endTime, customEndTime);

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

  describe('shouldCaptureContent', () => {
    it('should be false when the handler captures nothing', () => {
      const inv = new CustomInvocation('no-capture-span', handler);

      assert.strictEqual(inv.shouldCaptureContent(), false);

      inv.stop();
    });

    it('should be true when the handler enables content capture', () => {
      const capturingHandler = new TelemetryHandler({
        instrumentationName: '@opentelemetry/instrumentation-test-genai',
        instrumentationVersion: '9.9.9',
        tracerProvider: ctx.tracerProvider,
        meterProvider: ctx.meterProvider,
        contentCaptureMode: 'span_only',
      });
      const inv = new CustomInvocation('capture-span', capturingHandler);

      assert.strictEqual(inv.shouldCaptureContent(), true);

      inv.stop();
    });
  });

  describe('metric attributes', () => {
    it('should keep span attributes and metric attributes in separate bags', () => {
      const inv = new CustomInvocation('split-attrs-span', handler, {
        attributes: { 'gen_ai.operation.name': 'chat' },
        metricAttributes: { 'gen_ai.provider.name': 'openai' },
      });

      inv.setAttribute('custom.span.attr', 'span-value');
      inv.setMetricAttribute('custom.metric.attr', 'metric-value');
      inv.stop();

      // Metric attributes must not leak onto the span.
      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes['gen_ai.operation.name'], 'chat');
      assert.strictEqual(span.attributes['custom.span.attr'], 'span-value');
      assert.strictEqual(span.attributes['gen_ai.provider.name'], undefined);
      assert.strictEqual(span.attributes['custom.metric.attr'], undefined);

      // Span attributes, which may be high cardinality, must not leak onto metrics.
      assert.strictEqual(inv.recordMetricsCalls.length, 1);
      assert.deepStrictEqual(inv.recordMetricsCalls[0].metricAttributes, {
        'gen_ai.provider.name': 'openai',
        'custom.metric.attr': 'metric-value',
      });
    });

    it('should support setMetricAttributes and let later values win', () => {
      const inv = new CustomInvocation('merge-metric-attrs-span', handler, {
        metricAttributes: { 'gen_ai.provider.name': 'openai', keep: 'me' },
      });

      inv.setMetricAttributes({
        'gen_ai.provider.name': 'azure.ai.openai',
        'gen_ai.request.model': 'gpt-4',
      });
      inv.stop();

      assert.deepStrictEqual(inv.recordMetricsCalls[0].metricAttributes, {
        'gen_ai.provider.name': 'azure.ai.openai',
        'gen_ai.request.model': 'gpt-4',
        keep: 'me',
      });
    });

    it('should not mutate the caller-supplied metricAttributes option object', () => {
      const callerAttributes: Attributes = { 'gen_ai.provider.name': 'openai' };
      const inv = new CustomInvocation('no-mutation-span', handler, {
        metricAttributes: callerAttributes,
      });

      inv.setMetricAttribute('added.later', 'value');
      inv.fail(new Error('boom'));

      assert.deepStrictEqual(callerAttributes, {
        'gen_ai.provider.name': 'openai',
      });
    });

    it('should record error.type on metric attributes before _recordMetrics runs', () => {
      const inv = new CustomInvocation('metric-error-type-span', handler, {
        metricAttributes: { 'gen_ai.provider.name': 'openai' },
      });

      inv.fail(new Error('Test failure'));

      // error.type must already be present in the snapshot taken inside _recordMetrics,
      // so subclasses do not have to derive it from the raw error themselves.
      assert.deepStrictEqual(inv.recordMetricsCalls[0].metricAttributes, {
        'gen_ai.provider.name': 'openai',
        [ATTR_ERROR_TYPE]: 'Error',
      });

      const [span] = ctx.memoryExporter.getFinishedSpans();
      assert.strictEqual(span.attributes[ATTR_ERROR_TYPE], 'Error');
    });

    it('should not set error.type on metric attributes on the success path', () => {
      const inv = new CustomInvocation('metric-no-error-span', handler);

      inv.stop();

      assert.strictEqual(
        ATTR_ERROR_TYPE in inv.recordMetricsCalls[0].metricAttributes,
        false
      );
    });

    it('should let subclasses seed metric attributes and emit them on metrics', async () => {
      class MetricRecordingInvocation extends BaseInvocation {
        constructor(
          handlerArg: TelemetryHandler,
          options: Partial<BaseInvocationOptions> = {}
        ) {
          super('metric-recording-span', handlerArg, {
            kind: SpanKind.CLIENT,
            metricAttributes: {
              // The concrete invocation contributes its semantic convention dimensions;
              // caller-supplied values are merged last so that they win.
              'gen_ai.operation.name': 'chat',
              'gen_ai.request.model': 'default-model',
              ...options.metricAttributes,
            },
          });
        }

        public setResponseModel(model: string): void {
          this._metricAttributes['gen_ai.response.model'] = model;
        }

        protected override _recordMetrics(durationSec: number): void {
          this._handler.recordOperationDuration(
            durationSec,
            this._metricAttributes,
            this._context
          );
          this._handler.recordTokenUsage(
            { inputTokens: 10, outputTokens: 5 },
            this._metricAttributes,
            this._context
          );
        }
      }

      const inv = new MetricRecordingInvocation(handler, {
        metricAttributes: { 'gen_ai.request.model': 'gpt-4' },
      });
      inv.setResponseModel('gpt-4-0613');
      inv.stop();

      const expectedAttributes = {
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': 'gpt-4',
        'gen_ai.response.model': 'gpt-4-0613',
      };

      const metrics = (
        await ctx.metricReader.collect()
      ).resourceMetrics.scopeMetrics.flatMap(sm => sm.metrics);

      const duration = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_DURATION
      );
      assert.ok(duration);
      assert.strictEqual(duration.dataPoints.length, 1);
      assert.deepStrictEqual(duration.dataPoints[0].attributes, {
        ...expectedAttributes,
      });

      // The per-measurement token type must not leak back onto the other measurements.
      const tokenUsage = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_CLIENT_TOKEN_USAGE
      );
      assert.ok(tokenUsage);
      assert.deepStrictEqual(
        tokenUsage.dataPoints.map(dp => dp.attributes),
        [
          { ...expectedAttributes, [ATTR_GEN_AI_TOKEN_TYPE]: 'input' },
          { ...expectedAttributes, [ATTR_GEN_AI_TOKEN_TYPE]: 'output' },
        ]
      );
    });
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
        context: parentContext,
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
