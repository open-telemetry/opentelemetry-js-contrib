/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('node:assert/strict');
const { LangChainInstrumentation } = require('../../dist/index.cjs');
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
  const {
    Annotation,
    StateGraph,
    START,
    END,
  } = require('@langchain/langgraph');
  const { AIMessage, HumanMessage } = require('@langchain/core/messages');
  const State = Annotation.Root({ messages: Annotation() });
  const failure = new TypeError('synthetic graph failure');
  const operation = new StateGraph(State)
    .addNode('step', () => {
      if (process.argv[2] === 'error') throw failure;
      return { messages: [new AIMessage('graph result')] };
    })
    .addEdge(START, 'step')
    .addEdge('step', END)
    .compile({ name: 'test_graph' });
  const input = { messages: [new HumanMessage('hello')] };
  try {
    if (process.argv[2] === 'error') {
      await assert.rejects(operation.invoke(input), error => error === failure);
    } else if (process.argv[2] === 'stream') {
      for await (const chunk of await operation.stream(input)) {
        assert.ok(chunk);
      }
    } else {
      assert.equal(
        (await operation.invoke(input)).messages[0].content,
        'graph result'
      );
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
