/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('node:assert/strict');
const {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} = require('@opentelemetry/sdk-trace');
const { LangChainInstrumentation } = require('../../build/src');

async function main() {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  const instrumentation = new LangChainInstrumentation();
  instrumentation.setTracerProvider(provider);
  const load = mode =>
    mode === 'cjs'
      ? require('@langchain/core/runnables')
      : import('@langchain/core/runnables');
  const modules = [await load(process.argv[2])];
  instrumentation.disable();
  modules.push(await load(process.argv[2] === 'cjs' ? 'esm' : 'cjs'));
  const originals = modules.map(module => ({
    invoke: module.RunnableSequence.prototype.invoke,
    map: module.RunnableMap.prototype.invoke,
    batch: module.RunnableSequence.prototype.batch,
    stream: module.RunnableSequence.prototype.stream,
    transform: module.RunnableMap.prototype.transform,
  }));
  try {
    for (let cycle = 0; cycle < 2; cycle++) {
      instrumentation.enable();
      instrumentation.enable();
      for (const [index, module] of modules.entries()) {
        const { RunnableLambda, RunnableMap, RunnableSequence } = module;
        assert.notEqual(
          RunnableSequence.prototype.invoke,
          originals[index].invoke
        );
        assert.notEqual(RunnableMap.prototype.invoke, originals[index].map);
        assert.notEqual(
          RunnableSequence.prototype.batch,
          originals[index].batch
        );
        assert.equal(
          RunnableSequence.prototype.stream,
          originals[index].stream
        );
        assert.equal(
          RunnableMap.prototype.transform,
          originals[index].transform
        );
        const chain = RunnableSequence.from([
          RunnableLambda.from(value => value.toUpperCase()),
          RunnableLambda.from(value => `${value}!`),
        ]).withConfig({ runName: 'loading' });
        assert.equal(await chain.invoke('hello'), 'HELLO!');
        assert.deepEqual(await chain.batch(['one', 'two']), ['ONE!', 'TWO!']);
        assert.deepEqual(
          await RunnableMap.from({
            value: RunnableLambda.from(value => value),
          }).invoke('test'),
          { value: 'test' }
        );
      }
      assert.equal(exporter.getFinishedSpans().length, 6);
      exporter.reset();
      instrumentation.disable();
      for (const [index, module] of modules.entries()) {
        assert.equal(
          module.RunnableSequence.prototype.invoke,
          originals[index].invoke
        );
        assert.equal(module.RunnableMap.prototype.invoke, originals[index].map);
        assert.equal(
          module.RunnableSequence.prototype.batch,
          originals[index].batch
        );
      }
    }
  } finally {
    instrumentation.disable();
    await provider.shutdown();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
