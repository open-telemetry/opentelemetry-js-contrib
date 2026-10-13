/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('node:assert/strict');
const { LangChainInstrumentation } = require('../../build/src');
const {
  TracerProvider,
  SimpleSpanProcessor,
} = require('@opentelemetry/sdk-trace');
const {
  MeterProvider,
  PeriodicExportingMetricReader,
} = require('@opentelemetry/sdk-metrics');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-grpc');
const {
  OTLPMetricExporter,
} = require('@opentelemetry/exporter-metrics-otlp-grpc');

async function main() {
  const tracing = new TracerProvider({
    spanProcessors: [
      new SimpleSpanProcessor({ exporter: new OTLPTraceExporter() }),
    ],
  });
  const metering = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }),
    ],
  });
  const instrumentation = new LangChainInstrumentation();
  instrumentation.setTracerProvider(tracing);
  instrumentation.setMeterProvider(metering);
  const { tool } = require('@langchain/core/tools');
  const failure = new TypeError('synthetic tool failure');
  const fail = process.argv[2] === 'error';
  const operation = tool(
    async () => {
      if (fail) throw failure;
      return 'tool result';
    },
    { name: 'test_tool', description: 'Offline donated tool scenario' }
  );
  try {
    if (fail) {
      await assert.rejects(
        operation.invoke('hello'),
        error => error === failure
      );
    } else {
      assert.equal(await operation.invoke('hello'), 'tool result');
    }
  } finally {
    instrumentation.disable();
    await tracing.shutdown();
    await metering.shutdown();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
