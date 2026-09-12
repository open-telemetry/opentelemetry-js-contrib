/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { diag, type DiagLogger } from '@opentelemetry/api';
import { TelemetryHandler } from '../src/handler';
import { BaseInvocation } from '../src/invocations/base';
import { GEN_AI_SCHEMA_URL } from '../src/semconv';
import type { CompletionResult } from '../src/types';
import { PACKAGE_NAME, PACKAGE_VERSION } from '../src/version';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from './helpers/test-setup';

class TestInvocation extends BaseInvocation {
  protected override _runCompletionHook(
    durationSec: number,
    error?: Error
  ): void {
    void this._handler.getCompletionHookManager().execute(
      {
        span: this._span,
        durationSeconds: durationSec,
        error,
      },
      this._handler.getDiag()
    );
  }
}

describe('TelemetryHandler', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  it('should initialize with default options', () => {
    const handler = new TelemetryHandler();

    assert.ok(handler.getTracer());
    assert.ok(handler.getMeter());
    assert.strictEqual(handler.getDiag(), diag);
    assert.strictEqual(handler.getContentCaptureMode(), 'none');
    assert.strictEqual(handler.getCompletionHookManager().getHooks().length, 0);
  });

  it('should initialize with custom options and initialize histograms', () => {
    const customDiag: DiagLogger = {
      verbose: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const handler = new TelemetryHandler({
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
      diag: customDiag,
      contentCaptureMode: 'span_only',
      completionHooks: [
        {
          onCompletion: () => {},
        },
      ],
    });

    assert.ok(handler.getTracer());
    assert.ok(handler.getMeter());
    assert.strictEqual(handler.getDiag(), customDiag);
    assert.strictEqual(handler.getContentCaptureMode(), 'span_only');
    assert.strictEqual(handler.getCompletionHookManager().getHooks().length, 1);
  });

  it('should initialize tracer and meter with package version and SemConv schema URL', async () => {
    const handler = new TelemetryHandler({
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
    });

    const span = handler.getTracer().startSpan('test-schema-span');
    span.end();

    const finishedSpans = ctx.memoryExporter.getFinishedSpans();
    const spanRecord = finishedSpans.find(s => s.name === 'test-schema-span');
    assert.ok(spanRecord);
    assert.strictEqual(spanRecord.instrumentationScope.name, PACKAGE_NAME);
    assert.strictEqual(
      spanRecord.instrumentationScope.version,
      PACKAGE_VERSION
    );
    assert.strictEqual(
      spanRecord.instrumentationScope.schemaUrl,
      GEN_AI_SCHEMA_URL
    );

    handler.recordOperationDuration(0.5);
    const metricCollection = await ctx.metricReader.collect();
    const scopeMetric = metricCollection.resourceMetrics.scopeMetrics.find(
      sm => sm.scope.name === PACKAGE_NAME
    );
    assert.ok(scopeMetric);
    assert.strictEqual(scopeMetric.scope.name, PACKAGE_NAME);
    assert.strictEqual(scopeMetric.scope.version, PACKAGE_VERSION);
    assert.strictEqual(scopeMetric.scope.schemaUrl, GEN_AI_SCHEMA_URL);
  });

  it('should add completion hooks via addCompletionHook', () => {
    const handler = new TelemetryHandler();
    const hook = {
      onCompletion: () => {},
    };

    handler.addCompletionHook(hook);
    assert.strictEqual(handler.getCompletionHookManager().getHooks().length, 1);
  });

  it('should record metrics and handle boundary values when meterProvider is configured', () => {
    const handler = new TelemetryHandler({ meterProvider: ctx.meterProvider });

    // Valid recordings
    handler.recordOperationDuration(1.23, { 'gen_ai.system': 'openai' });
    handler.recordTokenUsage(
      { inputTokens: 10, outputTokens: 25 },
      { 'gen_ai.system': 'openai' }
    );
    handler.recordTimeToFirstChunk(0.45, { 'gen_ai.system': 'openai' });
    handler.recordTimePerOutputChunk(0.12, { 'gen_ai.system': 'openai' });

    // Boundary/invalid duration values should be ignored without error
    handler.recordOperationDuration(-1);
    handler.recordOperationDuration(NaN);
    handler.recordOperationDuration(Infinity);
    handler.recordTimeToFirstChunk(-1);
    handler.recordTimeToFirstChunk(NaN);
    handler.recordTimeToFirstChunk(Infinity);
    handler.recordTimePerOutputChunk(-1);
    handler.recordTimePerOutputChunk(NaN);
    handler.recordTimePerOutputChunk(Infinity);

    // Boundary/partial token usage values
    handler.recordTokenUsage({ inputTokens: 10 }); // only input tokens
    handler.recordTokenUsage({ outputTokens: 20 }); // only output tokens
    handler.recordTokenUsage({ inputTokens: -5, outputTokens: -10 }); // negative tokens ignored
    handler.recordTokenUsage(undefined as any); // undefined usage ignored
  });

  it('should safely handle metric recordings with default meter', () => {
    const handler = new TelemetryHandler();

    // None of these should throw
    assert.doesNotThrow(() => {
      handler.recordOperationDuration(1.0);
      handler.recordTokenUsage({ inputTokens: 5, outputTokens: 10 });
      handler.recordTimeToFirstChunk(0.2);
      handler.recordTimePerOutputChunk(0.05);
    });
  });

  it('should resolve content capture mode with correct priority', () => {
    // 1. Explicit contentCaptureMode in options
    const handlerExplicit = new TelemetryHandler({
      contentCaptureMode: 'span_only',
      config: { captureMessageContent: 'none' },
    });
    assert.strictEqual(handlerExplicit.getContentCaptureMode(), 'span_only');

    // 2. Config captureMessageContent fallback
    const handlerConfig = new TelemetryHandler({
      config: { captureMessageContent: 'span_only' },
    });
    assert.strictEqual(handlerConfig.getContentCaptureMode(), 'span_only');

    // 3. Environment variable fallback
    process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT =
      'span_only';
    const handlerEnv = new TelemetryHandler();
    assert.strictEqual(handlerEnv.getContentCaptureMode(), 'span_only');
    delete process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
  });

  it('should determine whether to capture content based on mode or completion hooks', () => {
    // 1. Defaults to false when mode is none and no hooks
    const handlerDefault = new TelemetryHandler();
    assert.strictEqual(handlerDefault.shouldCaptureContent(), false);

    // 2. True when capture mode is span_only
    const handlerSpanOnly = new TelemetryHandler({
      contentCaptureMode: 'span_only',
    });
    assert.strictEqual(handlerSpanOnly.shouldCaptureContent(), true);

    // 3. True when mode is none but completion hook is present
    const handlerWithHook = new TelemetryHandler({
      contentCaptureMode: 'none',
      completionHooks: [{ onCompletion: () => {} }],
    });
    assert.strictEqual(handlerWithHook.shouldCaptureContent(), true);

    // 4. Becomes true when hook is added dynamically
    const handlerDynamic = new TelemetryHandler();
    assert.strictEqual(handlerDynamic.shouldCaptureContent(), false);
    handlerDynamic.addCompletionHook({ onCompletion: () => {} });
    assert.strictEqual(handlerDynamic.shouldCaptureContent(), true);
  });

  it('should integrate with BaseInvocation and execute completion hooks on stop', async () => {
    let hookResult: CompletionResult | undefined;

    const handler = new TelemetryHandler({
      tracerProvider: ctx.tracerProvider,
      completionHooks: [
        {
          onCompletion(result: CompletionResult) {
            hookResult = result;
          },
        },
      ],
    });

    const invocation = new TestInvocation('test-span', handler);
    invocation.stop();

    // Wait for async execution of completion hook
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.ok(hookResult);
    assert.strictEqual(hookResult.span, invocation.getSpan());
    assert.ok(typeof hookResult.durationSeconds === 'number');
    assert.strictEqual(hookResult.error, undefined);
  });

  it('should integrate with BaseInvocation and execute completion hooks on fail', async () => {
    let hookResult: CompletionResult | undefined;

    const handler = new TelemetryHandler({
      tracerProvider: ctx.tracerProvider,
      completionHooks: [
        {
          onCompletion(result: CompletionResult) {
            hookResult = result;
          },
        },
      ],
    });

    const invocation = new TestInvocation('test-span-error', handler);
    const testError = new Error('Test failure');
    invocation.fail(testError);

    // Wait for async execution of completion hook
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.ok(hookResult);
    assert.strictEqual(hookResult.span, invocation.getSpan());
    assert.strictEqual(hookResult.error, testError);
  });
});
