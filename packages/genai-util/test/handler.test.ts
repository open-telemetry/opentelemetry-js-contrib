/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { diag, type DiagLogger } from '@opentelemetry/api';
import { TelemetryHandler } from '../src/handler';
import { BaseInvocation } from '../src/invocations/base';
import type { CompletionResult } from '../src/types';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from './helpers/test-setup';

class TestInvocation extends BaseInvocation {
  protected override _runCompletionHook(
    durationSec: number,
    error?: Error
  ): void {
    if (this._handler) {
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
    assert.strictEqual(handler.getMeter(), undefined);
    assert.strictEqual(handler.getDiag(), diag);
    assert.strictEqual(handler.getContentCaptureMode(), 'none');
    assert.strictEqual(handler.getCompletionHookManager().getHooks().length, 0);
  });

  it('should initialize with custom options and initialize histograms', () => {
    const tracer = ctx.tracerProvider.getTracer('custom-tracer');
    const meter = ctx.meterProvider.getMeter('custom-meter');
    const customDiag: DiagLogger = {
      verbose: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const handler = new TelemetryHandler({
      tracer,
      meter,
      diag: customDiag,
      contentCaptureMode: 'span_only',
      completionHooks: [
        {
          onCompletion: () => {},
        },
      ],
    });

    assert.strictEqual(handler.getTracer(), tracer);
    assert.strictEqual(handler.getMeter(), meter);
    assert.strictEqual(handler.getDiag(), customDiag);
    assert.strictEqual(handler.getContentCaptureMode(), 'span_only');
    assert.strictEqual(handler.getCompletionHookManager().getHooks().length, 1);
  });

  it('should allow dynamic setter of tracer and meter', () => {
    const handler = new TelemetryHandler();
    const tracer = ctx.tracerProvider.getTracer('dynamic-tracer');
    const meter = ctx.meterProvider.getMeter('dynamic-meter');

    handler.setTracer(tracer);
    handler.setMeter(meter);

    assert.strictEqual(handler.getTracer(), tracer);
    assert.strictEqual(handler.getMeter(), meter);
  });

  it('should add completion hooks via addCompletionHook', () => {
    const handler = new TelemetryHandler();
    const hook = {
      onCompletion: () => {},
    };

    handler.addCompletionHook(hook);
    assert.strictEqual(handler.getCompletionHookManager().getHooks().length, 1);
  });

  it('should safely delegate metric recordings when meter is configured', () => {
    const meter = ctx.meterProvider.getMeter('test-meter');
    const handler = new TelemetryHandler({ meter });

    // Should record without throwing
    handler.recordOperationDuration(1.23, { 'gen_ai.system': 'openai' });
    handler.recordTokenUsage(
      { inputTokens: 10, outputTokens: 25 },
      { 'gen_ai.system': 'openai' }
    );
    handler.recordTimeToFirstChunk(0.45, { 'gen_ai.system': 'openai' });
    handler.recordServerTimeToFirstToken(0.35, { 'gen_ai.system': 'openai' });
  });

  it('should safely handle metric recordings when meter is not configured', () => {
    const handler = new TelemetryHandler();

    // None of these should throw when meter is undefined
    assert.doesNotThrow(() => {
      handler.recordOperationDuration(1.0);
      handler.recordTokenUsage({ inputTokens: 5, outputTokens: 10 });
      handler.recordTimeToFirstChunk(0.2);
      handler.recordServerTimeToFirstToken(0.1);
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

  it('should integrate with BaseInvocation and execute completion hooks on stop', async () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    let hookResult: CompletionResult | undefined;

    const handler = new TelemetryHandler({
      tracer,
      completionHooks: [
        {
          onCompletion(result: CompletionResult) {
            hookResult = result;
          },
        },
      ],
    });

    const span = tracer.startSpan('test-span');
    const invocation = new TestInvocation(span, handler);
    invocation.stop();

    // Wait for async execution of completion hook
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.ok(hookResult);
    assert.strictEqual(hookResult.span, span);
    assert.ok(typeof hookResult.durationSeconds === 'number');
    assert.strictEqual(hookResult.error, undefined);
  });

  it('should integrate with BaseInvocation and execute completion hooks on fail', async () => {
    const tracer = ctx.tracerProvider.getTracer('test-tracer');
    let hookResult: CompletionResult | undefined;

    const handler = new TelemetryHandler({
      tracer,
      completionHooks: [
        {
          onCompletion(result: CompletionResult) {
            hookResult = result;
          },
        },
      ],
    });

    const span = tracer.startSpan('test-span-error');
    const invocation = new TestInvocation(span, handler);
    const testError = new Error('Test failure');
    invocation.fail(testError);

    // Wait for async execution of completion hook
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.ok(hookResult);
    assert.strictEqual(hookResult.span, span);
    assert.strictEqual(hookResult.error, testError);
  });
});
