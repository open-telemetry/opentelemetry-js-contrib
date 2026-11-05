/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('node:assert/strict');
const { context } = require('@opentelemetry/api');
const {
  AsyncLocalStorageContextManager,
} = require('@opentelemetry/context-async-hooks');
const {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} = require('@opentelemetry/sdk-trace');
const { LangChainInstrumentation } = require('../../dist/index.cjs');

async function main() {
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable()
  );
  const firstExporter = new InMemorySpanExporter();
  const secondExporter = new InMemorySpanExporter();
  const firstProvider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: firstExporter })],
  });
  const secondProvider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: secondExporter })],
  });
  const first = new LangChainInstrumentation();
  first.setTracerProvider(firstProvider);
  const second = new LangChainInstrumentation();
  second.setTracerProvider(secondProvider);
  try {
    const modes = [process.argv[2], process.argv[2] === 'cjs' ? 'esm' : 'cjs'];
    const modules = [];
    for (const mode of modes) {
      modules.push(
        mode === 'cjs'
          ? require('@langchain/langgraph')
          : await import('@langchain/langgraph')
      );
    }
    for (const module of modules) {
      const { Annotation, StateGraph, START, END } = module;
      const State = Annotation.Root({ value: Annotation() });
      const nested = new StateGraph(State)
        .addNode('step', state => ({ value: state.value + 1 }))
        .addEdge(START, 'step')
        .addEdge('step', END)
        .compile({ name: 'nested-graph' });
      const graph = new StateGraph(State)
        .addNode('step', async state => {
          await Promise.resolve();
          const span = firstProvider
            .getTracer('graph-node')
            .startSpan('inside-graph');
          span.end();
          return nested.invoke(state, { runName: 'nested-graph' });
        })
        .addEdge(START, 'step')
        .addEdge('step', END)
        .compile({ name: 'loaded-graph' });
      for (const useSecond of [true, false]) {
        if (useSecond) second.enable();
        else second.disable();
        firstExporter.reset();
        secondExporter.reset();
        const observed = [];
        assert.deepEqual(
          await graph.invoke(
            { value: 1 },
            {
              callbacks: [
                {
                  handleChainStart(
                    _chain,
                    _input,
                    _runId,
                    _parent,
                    _tags,
                    _metadata,
                    _type,
                    name
                  ) {
                    observed.push(name);
                  },
                },
              ],
            }
          ),
          { value: 2 }
        );
        assert.ok(
          observed.includes('nested-graph'),
          'inherited callbacks survive across SDK module formats'
        );
        const graphExporter = useSecond ? secondExporter : firstExporter;
        const spans = [
          ...firstExporter.getFinishedSpans(),
          ...secondExporter.getFinishedSpans(),
        ];
        assert.equal(spans.length, 3);
        const graphSpan = graphExporter
          .getFinishedSpans()
          .find(span => span.name === 'invoke_workflow loaded-graph');
        assert.ok(graphSpan);
        assert.equal(
          spans.find(span => span.name === 'invoke_workflow nested-graph')
            .parentSpanContext.spanId,
          graphSpan.spanContext().spanId
        );
        assert.equal(
          spans.find(span => span.name === 'inside-graph').parentSpanContext
            .spanId,
          graphSpan.spanContext().spanId
        );
      }
    }
  } finally {
    first.disable();
    second.disable();
    await firstProvider.shutdown();
    await secondProvider.shutdown();
    context.disable();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
