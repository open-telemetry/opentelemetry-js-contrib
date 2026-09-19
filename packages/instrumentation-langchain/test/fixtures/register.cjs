/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const path = require('node:path');
const { context, trace } = require('@opentelemetry/api');
const {
  AsyncLocalStorageContextManager,
} = require('@opentelemetry/context-async-hooks');
const {
  TracerProvider,
  SimpleSpanProcessor,
  InMemorySpanExporter,
} = require('@opentelemetry/sdk-trace');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { LangChainInstrumentation } = require(
  path.resolve(__dirname, '..', '..', 'build', 'src')
);

const exporter = new InMemorySpanExporter();
const provider = new TracerProvider({
  spanProcessors: [new SimpleSpanProcessor({ exporter })],
});
context.setGlobalContextManager(new AsyncLocalStorageContextManager());
trace.setGlobalTracerProvider(provider);
registerInstrumentations({
  tracerProvider: provider,
  instrumentations: [
    new LangChainInstrumentation({ captureMessageContent: true }),
  ],
});
module.exports = { exporter, provider };
