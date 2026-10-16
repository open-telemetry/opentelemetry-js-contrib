/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import * as assert from 'node:assert/strict';
import { context, diag, metrics, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  getTestSpans,
  resetMemoryExporter,
  TestMetricReader,
} from '@opentelemetry/contrib-test-utils';
import { DataPointType, MeterProvider } from '@opentelemetry/sdk-metrics';
import {
  RunnableAssign,
  RunnableBinding,
  RunnableLambda,
  RunnableMap,
  RunnablePassthrough,
  RunnableSequence,
  RunnableToolLike,
  RunnableWithMessageHistory,
} from '@langchain/core/runnables';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { DynamicTool } from '@langchain/core/tools';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import type { Runnable } from '@langchain/core/runnables';
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
} from '@langchain/core/messages';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import type { InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { isWrapped } from '@opentelemetry/instrumentation';
import type * as LangChain from 'langchain';
import * as sinon from 'sinon';
import {
  markWorkflow,
  isInternalWorkflow,
  ownValue,
  trackFactory,
  trackOwnedWorkflow,
} from '../src/internal-workflows';

const schema = new DynamicTool({
  name: 'schema',
  description: 'Local test schema',
  func: async input => input,
}).schema
  .innerType()
  .required();
const identity = () =>
  RunnableSequence.from([
    RunnableLambda.from((value: { input: string }) => value),
    RunnableLambda.from((value: { input: string }) => value),
  ]);

class LocalModel extends BaseChatModel {
  constructor() {
    super({});
  }
  _llmType() {
    return 'local-test';
  }
  override bindTools(): Runnable<BaseLanguageModelInput, AIMessageChunk> {
    return this;
  }
  async _generate() {
    return {
      generations: [
        {
          text: 'answer',
          message: new AIMessageChunk({
            content: 'answer',
            tool_calls: [
              { name: 'extract', args: { answer: 'test' }, id: 'call' },
            ],
          }),
        },
      ],
    };
  }
}

describe('LangChain application workflow boundaries', () => {
  let reader: TestMetricReader;
  let provider: MeterProvider;
  beforeEach(() => {
    reader = new TestMetricReader();
    provider = new MeterProvider({ readers: [reader] });
    instrumentation.setMeterProvider(provider);
    instrumentation.setConfig({ captureMessageContent: 'none' });
    instrumentation.enable();
    resetMemoryExporter();
  });
  afterEach(async () => {
    instrumentation.disable();
    sinon.restore();
    instrumentation.setMeterProvider(metrics.getMeterProvider());
    await provider.shutdown();
  });

  async function expectWorkflows(names: string[]) {
    const spans = getTestSpans();
    assert.deepEqual(spans.map(span => span.name).sort(), names.slice().sort());
    const result = await reader.collect();
    assert.deepEqual(result.errors, []);
    let count = 0;
    for (const scope of result.resourceMetrics.scopeMetrics) {
      for (const metric of scope.metrics) {
        assert.equal(metric.descriptor.name, 'gen_ai.invoke_workflow.duration');
        assert.ok(metric.dataPointType === DataPointType.HISTOGRAM);
        count += metric.dataPoints.reduce(
          (sum, point) => sum + point.value.count,
          0
        );
      }
    }
    assert.equal(count, names.length);
  }

  it('does not report the asTool input adapter as a workflow', async () => {
    const tool = RunnableLambda.from((input: { input: string }) =>
      input.input.toUpperCase()
    ).asTool({ name: 'uppercase_tool', description: 'Test only', schema });
    assert.equal(await tool.invoke({ input: 'hello' }), 'HELLO');
    await expectWorkflows([]);
  });

  for (const configured of [false, true]) {
    for (const method of ['invoke', 'batch'] as const) {
      it(`excludes direct tool constructors (${method}, configured=${configured})`, async () => {
        let tool: Runnable<{ input: string }, string> = new RunnableToolLike({
          name: 'direct-tool',
          schema,
          bound: RunnableLambda.from((value: { input: string }) => value.input),
        });
        if (configured) {
          tool = tool
            .withConfig({ tags: ['first'] })
            .withConfig({ tags: ['second'] });
        }
        if (method === 'invoke') {
          assert.equal(await tool.invoke({ input: 'hello' }), 'hello');
        } else {
          assert.deepEqual(
            await tool.batch([{ input: 'one' }, { input: 'two' }]),
            ['one', 'two']
          );
        }
        await expectWorkflows([]);
      });
    }
  }

  for (const kind of ['sequence', 'map'] as const) {
    for (const named of [false, true]) {
      it(`retains a ${named ? 'named' : 'unnamed'} application ${kind} inside a direct tool`, async () => {
        const child =
          kind === 'sequence'
            ? identity()
            : RunnableMap.from({
                input: RunnableLambda.from(
                  (value: { input: string }) => value.input
                ),
              });
        if (named) child.name = 'application-child';
        const tool = new RunnableToolLike({
          name: 'direct-tool',
          schema,
          bound: child,
        }).withConfig({ tags: ['configured'] });
        assert.deepEqual(await tool.invoke({ input: 'hello' }), {
          input: 'hello',
        });
        await expectWorkflows([
          named ? 'invoke_workflow application-child' : 'invoke_workflow',
        ]);
      });
    }
  }

  for (const method of ['invoke', 'batch'] as const) {
    it(`excludes direct message-history constructors (${method})`, async () => {
      const history = new InMemoryChatMessageHistory();
      const runnable = new RunnableWithMessageHistory({
        runnable: RunnableLambda.from(() => new AIMessage('answer')),
        getMessageHistory: () => history,
        config: {
          tags: ['constructor-config'],
          configurable: { sessionId: 'session' },
        },
      });
      if (method === 'invoke') {
        assert.equal((await runnable.invoke('question')).content, 'answer');
      } else {
        const output = await runnable.batch(['one', 'two']);
        assert.deepEqual(
          output.map(message => message.content),
          ['answer', 'answer']
        );
      }
      await expectWorkflows([]);
    });
  }

  for (const kind of ['sequence', 'map'] as const) {
    for (const named of [false, true]) {
      it(`retains a ${named ? 'named' : 'unnamed'} application ${kind} inside message history`, async () => {
        const answer = RunnableLambda.from(() => new AIMessage('answer'));
        const child =
          kind === 'sequence'
            ? RunnableSequence.from([
                RunnableLambda.from((value: unknown) => value),
                answer,
              ])
            : RunnableMap.from({ answer });
        if (named) child.name = 'application-child';
        const runnable = new RunnableWithMessageHistory<unknown, unknown>({
          runnable: child,
          getMessageHistory: () => new InMemoryChatMessageHistory(),
        });
        const output = await runnable.invoke('question', {
          configurable: { sessionId: 'session' },
        });
        assert.ok(output);
        await expectWorkflows([
          named ? 'invoke_workflow application-child' : 'invoke_workflow',
        ]);
      });
    }
  }

  it('parents history-wrapped nested application workflows to the real outer workflow', async () => {
    const inner = RunnableSequence.from([
      RunnableLambda.from((input: unknown) => input),
      RunnableLambda.from(() => new AIMessage('answer')),
    ]).withConfig({ runName: 'application-inner' });
    const history = new RunnableWithMessageHistory({
      runnable: inner,
      getMessageHistory: () => new InMemoryChatMessageHistory(),
      inputMessagesKey: 'question',
      historyMessagesKey: 'history',
    });
    const outer = RunnableSequence.from([
      RunnableLambda.from((value: { question: string }) => value),
      history,
    ]).withConfig({ runName: 'application-outer' });
    const output = await outer.invoke(
      { question: 'hello' },
      { configurable: { sessionId: 'session' } }
    );
    assert.equal(output.content, 'answer');
    await expectWorkflows([
      'invoke_workflow application-inner',
      'invoke_workflow application-outer',
    ]);
    const spans = getTestSpans();
    assert.equal(
      spans[0].parentSpanContext?.spanId,
      spans[1].spanContext().spanId
    );
  });

  it('preserves direct owner batch children, disabled construction and suppression', async () => {
    instrumentation.disable();
    const toolChild = identity();
    toolChild.name = 'tool-child';
    const tool = new RunnableToolLike({
      name: 'direct-tool',
      schema,
      bound: toolChild,
    })
      .withConfig({ tags: ['first'] })
      .withConfig({ tags: ['second'] });
    const history = new RunnableWithMessageHistory({
      runnable: RunnableSequence.from([
        RunnableLambda.from((input: unknown) => input),
        RunnableLambda.from(() => new AIMessage('answer')),
      ]),
      getMessageHistory: () => new InMemoryChatMessageHistory(),
    });
    history.runnable.name = 'history-child';
    const options = { configurable: { sessionId: 'session' } };
    await tool.invoke({ input: 'disabled' });
    await history.invoke('disabled', options);
    await expectWorkflows([]);
    instrumentation.enable();
    await context.with(suppressTracing(context.active()), () =>
      tool.invoke({ input: 'suppressed' })
    );
    await context.with(suppressTracing(context.active()), () =>
      history.invoke('suppressed', options)
    );
    await expectWorkflows([]);
    await Promise.all([
      tool.batch([{ input: 'one' }, { input: 'two' }]),
      history.batch(['one', 'two'], options),
    ]);
    await expectWorkflows([
      'invoke_workflow tool-child',
      'invoke_workflow history-child',
    ]);
    assert.equal(trace.getSpan(context.active()), undefined);
  });

  it('excludes adapters without swallowing original failures or workflow children', async () => {
    const failure = new TypeError('private failure');
    const application = RunnableSequence.from([
      RunnableLambda.from((value: { input: string }) => value),
      RunnableLambda.from(() => {
        throw failure;
      }),
    ]);
    const tool = application.asTool({ name: 'adapter', schema });
    await assert.rejects(
      tool.invoke({ input: 'input' }),
      error => error === failure
    );
    await expectWorkflows(['invoke_workflow']);
    assert.equal(getTestSpans()[0].attributes['error.type'], 'TypeError');
    assert.equal(getTestSpans()[0].status.message, undefined);
  });

  it('excludes optimized tool adapter batches while retaining the application batch', async () => {
    const tool = identity().asTool({ name: 'adapter', schema });
    const inputs = [{ input: 'one' }, { input: 'two' }];
    const result = await tool.batch(inputs, undefined, {
      returnExceptions: false,
    });
    assert.deepEqual(result, inputs);
    result.forEach((value, index) => assert.equal(value, inputs[index]));
    await expectWorkflows(['invoke_workflow']);
  });

  for (const named of [false, true]) {
    it(`preserves the application workflow bound to a tool (named=${named})`, async () => {
      const bound = identity();
      if (named) bound.name = 'application-inner';
      const tool = bound.asTool({ name: 'adapter-name', schema });
      assert.deepEqual(await tool.invoke({ input: 'hello' }), {
        input: 'hello',
      });
      await expectWorkflows([
        named ? 'invoke_workflow application-inner' : 'invoke_workflow',
      ]);
    });
  }

  it('preserves a real application map bound to a tool', async () => {
    const bound = RunnableMap.from({
      answer: RunnableLambda.from((value: { input: string }) => value.input),
    });
    bound.name = 'application-map';
    const tool = bound.asTool({ name: 'map-adapter', schema });
    assert.deepEqual(await tool.invoke({ input: 'hello' }), {
      answer: 'hello',
    });
    await expectWorkflows(['invoke_workflow application-map']);
  });

  it('preserves application workflows called by a tool and ordinary concurrent workflows', async () => {
    const inner = identity().withConfig({ runName: 'application-inner' });
    const tool = RunnableLambda.from((input: { input: string }) =>
      inner.invoke(input)
    ).asTool({ name: 'adapter-name', schema });
    const outer = RunnableSequence.from([
      RunnableLambda.from((input: { input: string }) => input),
      tool,
    ]).withConfig({ runName: 'application-outer' });
    const standalone = identity().withConfig({ runName: 'standalone' });
    assert.deepEqual(
      await Promise.all([
        outer.invoke({ input: 'one' }),
        standalone.invoke({ input: 'two' }),
      ]),
      [{ input: 'one' }, { input: 'two' }]
    );
    await expectWorkflows([
      'invoke_workflow application-inner',
      'invoke_workflow application-outer',
      'invoke_workflow standalone',
    ]);
    const spans = getTestSpans();
    const parent = spans.find(
      span => span.name === 'invoke_workflow application-outer'
    )!;
    assert.equal(
      spans.find(span => span.name === 'invoke_workflow application-inner')
        ?.parentSpanContext?.spanId,
      parent.spanContext().spanId
    );
    assert.equal(
      spans.find(span => span.name === 'invoke_workflow standalone')
        ?.parentSpanContext,
      undefined
    );
    assert.equal(trace.getSpan(context.active()), undefined);
  });

  it('does not report the internal map of RunnablePassthrough.assign', async () => {
    const assign = RunnablePassthrough.assign<
      { text: string },
      { upper: string }
    >({
      upper: (input: { text: string }) => input.text.toUpperCase(),
    });
    assert.deepEqual(await assign.invoke({ text: 'hello' }), {
      text: 'hello',
      upper: 'HELLO',
    });
    await expectWorkflows([]);
  });

  it('preserves a real application workflow in assign mappings and their outer composition', async () => {
    const inner = identity().withConfig({ runName: 'assigned-child' });
    const outer = identity()
      .assign({ added: inner })
      .withConfig({ runName: 'outer' });
    assert.deepEqual(await outer.invoke({ input: 'hello' }), {
      input: 'hello',
      added: { input: 'hello' },
    });
    await expectWorkflows([
      'invoke_workflow outer',
      'invoke_workflow assigned-child',
    ]);
    const spans = getTestSpans();
    assert.equal(
      spans[0].parentSpanContext?.spanId,
      spans[1].spanContext().spanId
    );
  });

  it('does not suppress an explicitly supplied map in new RunnableAssign', async () => {
    const map = RunnableMap.from<{ text: string }, { upper: string }>({
      upper: input => input.text.toUpperCase(),
    });
    map.name = 'application-map';
    const assign = new RunnableAssign({ mapper: map });
    assert.deepEqual(await assign.invoke({ text: 'hello' }), {
      text: 'hello',
      upper: 'HELLO',
    });
    await expectWorkflows(['invoke_workflow application-map']);
  });

  for (const includeRaw of [false, true]) {
    it(`does not report base model structured-output adapters (includeRaw=${includeRaw})`, async () => {
      const model = new LocalModel();
      const schema = {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      };
      if (includeRaw) {
        const result = await model
          .withStructuredOutput(schema, { includeRaw: true })
          .invoke('question');
        assert.deepEqual(result.parsed, { answer: 'test' });
        assert.equal(result.raw.content, 'answer');
      } else {
        assert.deepEqual(
          await model.withStructuredOutput(schema).invoke('question'),
          { answer: 'test' }
        );
      }
      await expectWorkflows([]);
    });
  }

  for (const includeRaw of [false, true]) {
    it(`preserves application workflow children of structured output (includeRaw=${includeRaw})`, async () => {
      class CompositeModel extends LocalModel {
        override bindTools(): Runnable<BaseLanguageModelInput, AIMessageChunk> {
          return RunnableSequence.from([
            RunnableLambda.from((value: BaseLanguageModelInput) => value),
            this,
          ]).withConfig({ runName: 'application-model-workflow' });
        }
      }
      const model = new CompositeModel();
      const output = includeRaw
        ? await model
            .withStructuredOutput({ type: 'object' }, { includeRaw: true })
            .invoke('question')
        : await model
            .withStructuredOutput({ type: 'object' })
            .invoke('question');
      assert.ok(output);
      await expectWorkflows(['invoke_workflow application-model-workflow']);
    });
  }

  it('registers the shipped agent-name factory independently of unrelated graph dependencies', async () => {
    const filename = join(
      dirname(require.resolve('langchain/package.json')),
      'dist',
      'agents',
      'withAgentName.cjs'
    );
    const sdkRequire = createRequire(filename);
    const exports: {
      withAgentName?: (model: Runnable, mode: string) => Runnable;
    } = {};
    // Exercise the shipped factory and real runnables, not the unrelated
    // agent utils module's graph dependencies. This is a module-hook test.
    runInNewContext(readFileSync(filename, 'utf8'), {
      exports,
      require: (name: string) =>
        name === './utils.cjs'
          ? {
              _addInlineAgentName: (message: unknown) => message,
              _removeInlineAgentName: (message: unknown) => message,
            }
          : sdkRequire(name),
    });
    const definitions = instrumentation.getModuleDefinitions();
    const module = definitions.find(
      definition => definition.name === 'langchain'
    ) as InstrumentationNodeModuleDefinition;
    const file = module.files.find(file =>
      file.name.endsWith('withAgentName.cjs')
    )!;
    file.moduleExports = exports;
    assert.ok(exports.withAgentName);
    const model = RunnableSequence.from([
      RunnableLambda.from((messages: HumanMessage[]) => messages),
      RunnableLambda.from(() => new AIMessageChunk('answer')),
    ]).withConfig({ runName: 'application-model' });
    const adapter = exports.withAgentName(model, 'inline');
    assert.equal(
      (await adapter.invoke([new HumanMessage('question')])).content,
      'answer'
    );
    await expectWorkflows(['invoke_workflow application-model']);
  });

  for (const includeAgentName of [undefined, 'inline'] as const) {
    for (const applicationWorkflow of [false, true]) {
      it(`excludes agent model adapters but preserves application workflows (inline=${includeAgentName === 'inline'}, application=${applicationWorkflow})`, async function () {
        try {
          require.resolve('@langchain/core/utils/uuid');
        } catch (error) {
          if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
          ) {
            // Current transitive graph packages need this newer core subpath.
            // The actual shipped helper is tested independently above on core1.0.
            this.skip();
          }
          throw error;
        }
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createAgent }: typeof LangChain = require('langchain');
        class AgentModel extends LocalModel {
          override bindTools(): Runnable<
            BaseLanguageModelInput,
            AIMessageChunk
          > {
            if (!applicationWorkflow) return this;
            return RunnableSequence.from([
              RunnableLambda.from((input: BaseLanguageModelInput) => input),
              this,
            ]).withConfig({ runName: 'application-model' });
          }
          override async _generate() {
            return {
              generations: [
                { text: 'answer', message: new AIMessageChunk('answer') },
              ],
            };
          }
        }
        const agent = createAgent({
          model: new AgentModel(),
          tools: [],
          name: 'local-agent',
          includeAgentName,
        });
        const result = await agent.invoke({
          messages: [new HumanMessage('question')],
        });
        assert.equal(result.messages.at(-1)?.content, 'answer');
        await expectWorkflows(
          applicationWorkflow ? ['invoke_workflow application-model'] : []
        );
      });
    }
  }

  it('classifies only compositions of exact SDK prompt objects, including disabled-time construction', async () => {
    const module = instrumentation
      .getModuleDefinitions()
      .find(
        definition => definition.name === 'langchain'
      ) as InstrumentationNodeModuleDefinition;
    const file = module.files.find(file => file.name.endsWith('utils.cjs'))!;
    const helper = {
      getPromptRunnable: () =>
        RunnableLambda.from((value: { input: string }) => value).withConfig({
          runName: 'same-prompt-name',
        }),
    };
    file.moduleExports = helper;
    instrumentation.disable();
    const child = identity();
    child.name = 'application-child';
    const prompt = helper.getPromptRunnable();
    const adapter = prompt.pipe(child);
    const wrapper = RunnableBinding.prototype.pipe;
    instrumentation.enable();
    instrumentation.disable();
    instrumentation.enable();
    assert.equal(RunnableBinding.prototype.pipe, wrapper);
    const input = { input: 'hello' };
    assert.equal(await adapter.invoke(input), input);
    assert.deepEqual(await adapter.batch([input]), [input]);
    const ordinary = RunnableLambda.from((value: { input: string }) => value)
      .withConfig({ runName: 'same-prompt-name' })
      .pipe(child);
    await ordinary.invoke(input);
    await expectWorkflows([
      'invoke_workflow application-child',
      'invoke_workflow application-child',
      'invoke_workflow application-child',
      'invoke_workflow',
    ]);
  });

  it('tracks adapter creation while disabled and still excludes only adapters after re-enable', async () => {
    instrumentation.disable();
    const tool = identity()
      .withConfig({ runName: 'tool-child' })
      .asTool({ name: 'adapter', schema })
      .withConfig({ tags: ['configured'] });
    const assign = RunnablePassthrough.assign({
      added: identity().withConfig({ runName: 'assign-child' }),
    });
    const structured = new LocalModel().withStructuredOutput(
      { type: 'object' },
      { includeRaw: true }
    );
    await tool.invoke({ input: 'disabled' });
    await expectWorkflows([]);
    instrumentation.enable();
    instrumentation.enable();
    await tool.invoke({ input: 'enabled' });
    await assign.invoke({ input: 'enabled' });
    await structured.invoke('question');
    await expectWorkflows([
      'invoke_workflow tool-child',
      'invoke_workflow assign-child',
    ]);
  });

  it('honors suppression for application children of adapters', async () => {
    const tool = identity().asTool({ name: 'adapter', schema });
    await context.with(suppressTracing(context.active()), () =>
      tool.invoke({ input: 'hidden' })
    );
    await expectWorkflows([]);
    await identity().invoke({ input: 'visible' });
    await expectWorkflows(['invoke_workflow']);
  });

  it('tracks adapters created during suppressed calls without suppressing later children', async () => {
    const assign = context.with(suppressTracing(context.active()), () =>
      RunnablePassthrough.assign({ answer: identity() })
    );
    const output = await assign.invoke({ input: 'visible' });
    assert.deepEqual(output.answer, { input: 'visible' });
    await expectWorkflows(['invoke_workflow']);
  });

  it('keeps identity factory hooks stable while restoring telemetry methods', () => {
    const asTool = RunnableLambda.prototype.asTool;
    const assign = RunnablePassthrough.assign;
    const toolInvoke = RunnableToolLike.prototype.invoke;
    const toolBatch = RunnableToolLike.prototype.batch;
    const historyInvoke = RunnableWithMessageHistory.prototype.invoke;
    const historyBatch = RunnableWithMessageHistory.prototype.batch;
    instrumentation.disable();
    instrumentation.enable();
    instrumentation.disable();
    instrumentation.enable();
    assert.equal(RunnableLambda.prototype.asTool, asTool);
    assert.equal(RunnablePassthrough.assign, assign);
    assert.equal(RunnableToolLike.prototype.invoke, toolInvoke);
    assert.equal(RunnableToolLike.prototype.batch, toolBatch);
    assert.equal(RunnableWithMessageHistory.prototype.invoke, historyInvoke);
    assert.equal(RunnableWithMessageHistory.prototype.batch, historyBatch);
    assert.equal(isWrapped(RunnableBinding.prototype.invoke), false);
    assert.equal(isWrapped(RunnableBinding.prototype.batch), false);
  });

  it('observes known owners before dispatch without changing receiver, arguments, Promise or errors', async () => {
    const getter = sinon.spy(() => {
      throw new Error('private getter');
    });
    class Owner {}
    const receiver = new Owner();
    Object.defineProperty(receiver, 'bound', { get: getter });
    const input = {};
    class SDKPromise extends Promise<string> {}
    const result = new SDKPromise(resolve => resolve('answer'));
    const original = sinon.spy(function (this: Owner, ...args: unknown[]) {
      assert.equal(this, receiver);
      assert.equal(args.length, 3);
      assert.equal(args[0], input);
      assert.equal(args[1], undefined);
      assert.equal(args[2], input);
      return result;
    });
    const observed = trackOwnedWorkflow(Owner, diag)(original);
    assert.equal(observed.call(receiver, input, undefined, input), result);
    assert.equal(await result, 'answer');
    assert.equal(getter.callCount, 0);
    assert.equal(original.callCount, 1);
    const application = identity();
    const borrowed = trackOwnedWorkflow(Owner, diag)(() => 'borrowed');
    assert.equal(borrowed.call({ bound: application }), 'borrowed');
    assert.equal(isInternalWorkflow(application), false);
    const failure = new Error('SDK failure');
    const throwing = trackOwnedWorkflow(
      Owner,
      diag
    )(() => {
      throw failure;
    });
    assert.throws(
      () => throwing.call(receiver),
      error => error === failure
    );
  });

  it('does not guess provenance for identical workflows created before factory tracking', async () => {
    const factory = () => identity().withConfig({ runName: 'same-name' });
    const earlier = factory();
    const trackedFactory = trackFactory(
      result => markWorkflow(result),
      diag
    )(factory);
    const tracked = trackedFactory();
    await earlier.invoke({ input: 'earlier' });
    await tracked.invoke({ input: 'tracked' });
    await expectWorkflows(['invoke_workflow same-name']);
  });

  it('preserves factory receivers, arguments, results and failures without invoking getters', async () => {
    const receiver = {};
    const argument = {};
    const result = Object.defineProperty({}, 'bound', {
      get() {
        throw new Error('private getter');
      },
    });
    const original = sinon.spy(function (this: object, ...args: unknown[]) {
      assert.equal(this, receiver);
      assert.deepEqual(args, [argument, undefined]);
      return result;
    });
    const wrapped = trackFactory(
      value => ownValue(value, 'bound'),
      diag
    )(original);
    assert.equal(wrapped.call(receiver, argument, undefined), result);
    assert.equal(original.callCount, 1);
    const promise = Promise.resolve(result);
    const asyncOriginal = () => promise;
    assert.equal(trackFactory(() => {}, diag)(asyncOriginal)(), promise);
    const error = new Error('private failure');
    assert.throws(
      trackFactory(() => {}, diag)(() => {
        throw error;
      }),
      actual => actual === error
    );
  });
});
