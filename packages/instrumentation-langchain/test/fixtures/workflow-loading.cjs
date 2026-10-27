/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('node:assert/strict');
const { context, trace } = require('@opentelemetry/api');
const {
  AsyncLocalStorageContextManager,
} = require('@opentelemetry/context-async-hooks');
const {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} = require('@opentelemetry/sdk-trace');
const { LangChainInstrumentation } = require('../../dist/index.cjs');
const { TestMetricReader } = require('@opentelemetry/contrib-test-utils');
const { MeterProvider, DataPointType } = require('@opentelemetry/sdk-metrics');

async function main() {
  const contextManager = new AsyncLocalStorageContextManager().enable();
  context.setGlobalContextManager(contextManager);
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  const instrumentation = new LangChainInstrumentation();
  instrumentation.setTracerProvider(provider);
  const secondExporter = new InMemorySpanExporter();
  const secondProvider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: secondExporter })],
  });
  const second = new LangChainInstrumentation({
    captureMessageContent: 'span_only',
  });
  second.setTracerProvider(secondProvider);
  const reader = new TestMetricReader();
  const meterProvider = new MeterProvider({ readers: [reader] });
  instrumentation.setMeterProvider(meterProvider);
  const load = mode =>
    mode === 'cjs'
      ? require('@langchain/core/runnables')
      : import('@langchain/core/runnables');
  const modules = [await load(process.argv[2])];
  instrumentation.disable();
  modules.push(await load(process.argv[2] === 'cjs' ? 'esm' : 'cjs'));
  second.disable();
  const adapters = [];
  for (const [index, module] of modules.entries()) {
    const mode =
      index === 0 ? process.argv[2] : process.argv[2] === 'cjs' ? 'esm' : 'cjs';
    const tools =
      mode === 'cjs'
        ? require('@langchain/core/tools')
        : await import('@langchain/core/tools');
    const { CallbackManager } =
      mode === 'cjs'
        ? require('@langchain/core/callbacks/manager')
        : await import('@langchain/core/callbacks/manager');
    const { BaseChatModel } =
      mode === 'cjs'
        ? require('@langchain/core/language_models/chat_models')
        : await import('@langchain/core/language_models/chat_models');
    const { AIMessageChunk } =
      mode === 'cjs'
        ? require('@langchain/core/messages')
        : await import('@langchain/core/messages');
    const { InMemoryChatMessageHistory } =
      mode === 'cjs'
        ? require('@langchain/core/chat_history')
        : await import('@langchain/core/chat_history');
    const schema = new tools.DynamicTool({
      name: 'schema',
      description: 'Test only',
      func: async value => value,
    }).schema
      .innerType()
      .required();
    const child = module.RunnableSequence.from([
      module.RunnableLambda.from(value => value),
      module.RunnableLambda.from(value => value),
    ]).withConfig({ runName: 'application-child' });
    class LocalModel extends BaseChatModel {
      constructor() {
        super({});
      }
      _llmType() {
        return 'local-test';
      }
      bindTools() {
        return this;
      }
      async _generate() {
        return {
          generations: [
            {
              text: '',
              message: new AIMessageChunk({
                content: '',
                tool_calls: [
                  { name: 'extract', args: { answer: 'test' }, id: 'call' },
                ],
              }),
            },
          ],
        };
      }
    }
    const executionContexts = [];
    adapters.push({
      tool: module.RunnableLambda.from(value => value.input).asTool({
        name: 'tool-adapter',
        schema,
      }),
      toolChild: child
        .asTool({ name: 'child-adapter', schema })
        .withConfig({ tags: ['test'] }),
      directTool: new module.RunnableToolLike({
        name: 'direct-adapter',
        schema,
        bound: module.RunnableLambda.from(value => value.input),
      }),
      directToolChild: new module.RunnableToolLike({
        name: 'direct-child-adapter',
        schema,
        bound: child,
      })
        .withConfig({ tags: ['first'] })
        .withConfig({ tags: ['second'] }),
      history: new module.RunnableWithMessageHistory({
        runnable: module.RunnableLambda.from(
          () => new AIMessageChunk('answer')
        ),
        getMessageHistory: () => new InMemoryChatMessageHistory(),
      }),
      historyChild: new module.RunnableWithMessageHistory({
        runnable: module.RunnableSequence.from(
          [
            module.RunnableLambda.from(value => value),
            module.RunnableLambda.from(() => new AIMessageChunk('answer')),
          ],
          { name: 'history-application' }
        ),
        getMessageHistory: () => new InMemoryChatMessageHistory(),
      }),
      assign: module.RunnablePassthrough.assign({
        answer: value => value.input,
      }),
      assignChild: module.RunnablePassthrough.assign({ answer: child }),
      structured: new LocalModel().withStructuredOutput(
        { type: 'object' },
        { includeRaw: true }
      ),
      callbackTool: new tools.DynamicTool({
        name: 'loaded-tool',
        description: 'Local tool loading scenario',
        func: async value => {
          await Promise.resolve();
          executionContexts.push(trace.getSpanContext(context.active()));
          return value;
        },
      }),
      executionContexts,
      originalToolCall: tools.DynamicTool.prototype._call,
      CallbackManager,
      asTool: module.Runnable.prototype.asTool,
      assignFactory: module.RunnablePassthrough.assign,
    });
  }
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
        const adapter = adapters[index];
        assert.equal(
          await adapter.tool.invoke({ input: 'tool-value' }),
          'tool-value'
        );
        assert.equal(
          await adapter.directTool.invoke({ input: 'direct-value' }),
          'direct-value'
        );
        assert.deepEqual(
          await adapter.directTool.batch([{ input: 'one' }, { input: 'two' }]),
          ['one', 'two']
        );
        assert.deepEqual(
          await adapter.directToolChild.invoke({ input: 'value' }),
          { input: 'value' }
        );
        assert.deepEqual(
          await adapter.directToolChild.batch([
            { input: 'one' },
            { input: 'two' },
          ]),
          [{ input: 'one' }, { input: 'two' }]
        );
        const historyOptions = { configurable: { sessionId: 'session' } };
        assert.equal(
          (await adapter.history.invoke('question', historyOptions)).content,
          'answer'
        );
        assert.deepEqual(
          (await adapter.history.batch(['one', 'two'], historyOptions)).map(
            message => message.content
          ),
          ['answer', 'answer']
        );
        assert.equal(
          (await adapter.historyChild.invoke('question', historyOptions))
            .content,
          'answer'
        );
        assert.deepEqual(
          (
            await adapter.historyChild.batch(['one', 'two'], historyOptions)
          ).map(message => message.content),
          ['answer', 'answer']
        );
        assert.deepEqual(
          await adapter.toolChild.invoke({ input: 'child-value' }),
          { input: 'child-value' }
        );
        assert.deepEqual(
          await adapter.assign.invoke({ input: 'assign-value' }),
          {
            input: 'assign-value',
            answer: 'assign-value',
          }
        );
        assert.deepEqual(
          await adapter.assignChild.invoke({ input: 'child-value' }),
          {
            input: 'child-value',
            answer: { input: 'child-value' },
          }
        );
        assert.deepEqual((await adapter.structured.invoke('question')).parsed, {
          answer: 'test',
        });
        assert.equal(
          await adapter.callbackTool.invoke('tool-value'),
          'tool-value'
        );
        assert.equal(module.Runnable.prototype.asTool, adapter.asTool);
        assert.equal(module.RunnablePassthrough.assign, adapter.assignFactory);
      }
      const spans = exporter.getFinishedSpans();
      assert.equal(spans.length, 20);
      assert.equal(
        spans.filter(
          span => span.attributes['gen_ai.operation.name'] === 'invoke_workflow'
        ).length,
        18
      );
      assert.equal(
        spans.filter(
          span => span.attributes['gen_ai.operation.name'] === 'execute_tool'
        ).length,
        2
      );
      for (const adapter of adapters) {
        const active = adapter.executionContexts.at(-1);
        assert.ok(active);
        assert.ok(
          spans.some(
            span =>
              span.name === 'execute_tool loaded-tool' &&
              span.spanContext().spanId === active.spanId
          )
        );
      }
      const collected = await reader.collect();
      assert.deepEqual(collected.errors, []);
      const metric = collected.resourceMetrics.scopeMetrics.flatMap(
        scope => scope.metrics
      )[0];
      assert.equal(metric.descriptor.name, 'gen_ai.invoke_workflow.duration');
      assert.equal(metric.dataPointType, DataPointType.HISTOGRAM);
      assert.equal(
        metric.dataPoints.reduce(
          (total, point) => total + point.value.count,
          0
        ),
        18 * (cycle + 1)
      );
      exporter.reset();
      instrumentation.disable();
      for (const [index, module] of modules.entries()) {
        assert.equal(
          adapters[index].callbackTool._call,
          adapters[index].originalToolCall
        );
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

    instrumentation.enable();
    for (const { callbackTool, CallbackManager } of adapters) {
      exporter.reset();
      const callbacks = CallbackManager.configure([]);
      const serialized = callbackTool.toJSON();
      const older = await callbacks.handleToolStart(serialized, '', 'reused');
      const newer = await callbacks.handleToolStart(serialized, '', 'reused');
      try {
        assert.equal(
          await callbackTool.invoke('child', {
            callbacks: older.getChild().copy(),
          }),
          'child'
        );
        await older.handleToolEnd('older');
        await newer.handleToolEnd('newer');
        const spans = exporter.getFinishedSpans();
        assert.equal(spans.length, 3);
        assert.equal(
          spans[0].parentSpanContext?.spanId,
          spans[1].spanContext().spanId
        );
      } finally {
        await older.handleToolEnd('cleanup');
        await newer.handleToolEnd('cleanup');
      }
    }
    instrumentation.disable();

    const instances = [instrumentation, second];
    const exporters = [exporter, secondExporter];
    const check = async owner => {
      for (const current of exporters) current.reset();
      for (const [
        moduleIndex,
        { RunnableLambda, RunnableMap, RunnableSequence },
      ] of modules.entries()) {
        const { CallbackManager } = adapters[moduleIndex];
        assert.equal(CallbackManager.configure(), undefined);
        const sequence = RunnableSequence.from([
          RunnableLambda.from(value => value),
          RunnableLambda.from(value => value),
        ]);
        assert.equal(await sequence.invoke('input'), 'input');
        assert.deepEqual(await sequence.batch(['input']), ['input']);
        assert.deepEqual(
          await RunnableMap.from({
            value: RunnableLambda.from(value => value),
          }).invoke('input'),
          { value: 'input' }
        );
        assert.equal(
          await adapters[moduleIndex].callbackTool.invoke('input'),
          'input'
        );
        assert.equal(CallbackManager.configure(), undefined);
      }
      for (const [index, current] of exporters.entries()) {
        const spans = current.getFinishedSpans();
        assert.equal(spans.length, index === owner ? modules.length * 4 : 0);
        for (const span of spans) {
          const content =
            span.attributes['gen_ai.operation.name'] === 'execute_tool'
              ? 'gen_ai.tool.call.arguments'
              : 'gen_ai.input.messages';
          assert.equal(content in span.attributes, owner === 1);
        }
        if (index === owner) {
          for (const adapter of adapters) {
            const active = adapter.executionContexts.at(-1);
            assert.ok(active);
            assert.ok(
              spans.some(
                span =>
                  span.name === 'execute_tool loaded-tool' &&
                  span.spanContext().spanId === active.spanId
              )
            );
          }
        }
      }
      if (owner === undefined) {
        for (const adapter of adapters)
          assert.equal(adapter.executionContexts.at(-1), undefined);
      }
    };
    for (const firstDisabled of [0, 1]) {
      for (const instance of instances) {
        instance.enable();
        instance.enable();
      }
      const wrappers = modules.map(module => [
        module.RunnableSequence.prototype.invoke,
        module.RunnableSequence.prototype.batch,
        module.RunnableMap.prototype.invoke,
      ]);
      await check(1);
      instances[firstDisabled].disable();
      instances[firstDisabled].disable();
      for (const [index, module] of modules.entries()) {
        assert.deepEqual(
          [
            module.RunnableSequence.prototype.invoke,
            module.RunnableSequence.prototype.batch,
            module.RunnableMap.prototype.invoke,
          ],
          wrappers[index]
        );
      }
      await check(1 - firstDisabled);
      instances[firstDisabled].enable();
      await check(firstDisabled);
      instances[1 - firstDisabled].disable();
      await check(firstDisabled);
      instances[firstDisabled].disable();
      await check();
      for (const [index, module] of modules.entries()) {
        assert.equal(
          module.RunnableSequence.prototype.invoke,
          originals[index].invoke
        );
        assert.equal(
          module.RunnableSequence.prototype.batch,
          originals[index].batch
        );
        assert.equal(module.RunnableMap.prototype.invoke, originals[index].map);
      }
    }

    const warnings = [[], []];
    const originalWarn = instances.map(instance => instance._diag.warn);
    for (const [index, instance] of instances.entries()) {
      instance.setConfig({ captureMessageContent: 'span_only' });
      instance._diag.warn = message => warnings[index].push(message);
    }
    try {
      const output = {};
      output.circular = output;
      for (const { callbackTool, CallbackManager } of adapters) {
        instrumentation.enable();
        second.enable();
        callbackTool.func = async () => output;
        const checkWarnings = (owner, message) => {
          for (const [index, messages] of warnings.entries()) {
            assert.deepEqual(messages, index === owner ? [message] : []);
            messages.length = 0;
          }
        };
        for (const owner of [1, 0]) {
          if (owner === 0) second.disable();
          assert.equal(await callbackTool.invoke('input'), output);
          checkWarnings(
            owner,
            'LangChain: could not extract tool result telemetry'
          );
          const addHandler = CallbackManager.prototype.addHandler;
          try {
            CallbackManager.prototype.addHandler = function (handler, inherit) {
              if (handler.name === 'opentelemetry_langchain_tools')
                throw new Error('synthetic registration failure');
              return addHandler.call(this, handler, inherit);
            };
            assert.equal(await callbackTool.invoke('input'), output);
            checkWarnings(
              owner,
              'LangChain: could not register tool callbacks'
            );
          } finally {
            CallbackManager.prototype.addHandler = addHandler;
          }
        }
        second.enable();
        let enter;
        let finish;
        const started = new Promise(resolve => {
          enter = resolve;
        });
        const pending = new Promise(resolve => {
          finish = resolve;
        });
        callbackTool.func = async () => {
          enter();
          return pending;
        };
        const result = callbackTool.invoke('input');
        await started;
        second.disable();
        instrumentation.disable();
        finish(output);
        assert.equal(await result, output);
        checkWarnings(1, 'LangChain: could not extract tool result telemetry');
      }
    } finally {
      for (const [index, instance] of instances.entries())
        instance._diag.warn = originalWarn[index];
    }
  } finally {
    instrumentation.disable();
    second.disable();
    await provider.shutdown();
    await secondProvider.shutdown();
    await meterProvider.shutdown();
    contextManager.disable();
    context.disable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
