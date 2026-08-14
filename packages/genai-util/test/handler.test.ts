/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { TelemetryHandler, type CompletionResult } from '../src';

class TestMetricReader extends MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

describe('TelemetryHandler', () => {
  let tracerProvider: BasicTracerProvider;
  let memoryExporter: InMemorySpanExporter;
  let meterProvider: MeterProvider;
  let metricReader: TestMetricReader;

  beforeEach(() => {
    memoryExporter = new InMemorySpanExporter();
    tracerProvider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
    });

    metricReader = new TestMetricReader();
    meterProvider = new MeterProvider({ readers: [metricReader] });
  });

  afterEach(async () => {
    await meterProvider.shutdown();
    await tracerProvider.shutdown();
  });

  it('should initialize with custom completion hook and run it on invocation stop', async () => {
    const tracer = tracerProvider.getTracer('test-tracer');
    let hookExecuted = false;

    const handler = new TelemetryHandler({
      tracer,
      completionHooks: [
        {
          onCompletion(result: CompletionResult) {
            hookExecuted = true;
            assert.strictEqual(result.providerName, 'openai');
          },
        },
      ],
    });

    const invocation = handler.startInference({
      providerName: 'openai',
      requestModel: 'gpt-4o',
    });
    invocation.stop();

    // Wait a tick for async completion hook
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(hookExecuted, true);
  });

  it('should allow dynamic setter of tracer and meter', () => {
    const handler = new TelemetryHandler();
    const tracer = tracerProvider.getTracer('dynamic-tracer');
    const meter = meterProvider.getMeter('dynamic-meter');

    handler.setTracer(tracer);
    handler.setMeter(meter);

    const inv = handler.startInference({
      providerName: 'cohere',
    });
    inv.stop();

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
  });
});
