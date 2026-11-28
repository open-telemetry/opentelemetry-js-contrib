/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const { OpenAIInstrumentation } = require('../../dist/index.cjs');
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

async function main(operation) {
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
  const instrumentation = new OpenAIInstrumentation();
  instrumentation.setTracerProvider(tracing);
  instrumentation.setMeterProvider(metering);
  try {
    const { OpenAI } = require('openai');
    const client = new OpenAI();
    const model = 'gpt-4o-mini';
    switch (operation) {
      case 'chat':
        await client.chat.completions.create({
          model,
          messages: [{ role: 'user', content: 'hello' }],
        });
        break;
      case 'responses':
        await client.responses.create({
          model,
          input: 'hello',
          instructions: 'Keep it short.',
        });
        break;
      case 'embeddings':
      case 'embeddings-default':
        await client.embeddings.create({
          model: 'text-embedding-3-small',
          input: 'hello',
          ...(operation === 'embeddings' && { encoding_format: 'float' }),
        });
        break;
      default:
        throw new Error(`Unknown scenario: ${operation}`);
    }
  } finally {
    instrumentation.disable();
    await Promise.all([tracing.shutdown(), metering.shutdown()]);
  }
}

main(process.argv[2]).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
