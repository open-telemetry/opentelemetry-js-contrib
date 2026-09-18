/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import './load-instrumentation';
import { expect } from 'expect';
import { diag } from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { CallbackHandlerMethods } from '@langchain/core/callbacks/base';
import { CallbackManager } from '@langchain/core/callbacks/manager';
import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import type { LLMResult } from '@langchain/core/outputs';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import {
  agentUsageCallbacks,
  createAgentUsageHandler,
} from '../src/agent-usage';

describe('agent usage callbacks', () => {
  let provider: TracerProvider;
  let exporter: InMemorySpanExporter;
  let span: Span;
  let background: string | undefined;
  const result: LLMResult = {
    generations: [
      [{ text: 'answer', generationInfo: { finish_reason: 'stop' } }],
    ],
    llmOutput: { tokenUsage: { promptTokens: 3, completionTokens: 5 } },
  };

  before(function () {
    // Every test creates SDK handlers whose names require Web Crypto UUIDs.
    if (Number(process.versions.node.split('.')[0]) < 20) this.skip();
  });

  beforeEach(() => {
    background = process.env.LANGCHAIN_CALLBACKS_BACKGROUND;
    delete process.env.LANGCHAIN_CALLBACKS_BACKGROUND;
    exporter = new InMemorySpanExporter();
    provider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
    });
    span = provider.getTracer('agent-usage-test').startSpan('agent');
  });

  afterEach(async () => {
    await awaitAllCallbacks();
    if (background === undefined)
      delete process.env.LANGCHAIN_CALLBACKS_BACKGROUND;
    else process.env.LANGCHAIN_CALLBACKS_BACKGROUND = background;
    span.end();
    await provider.shutdown();
  });

  for (const kind of ['array', 'manager'] as const) {
    it(`records before ending a span behind a slow background ${kind} callback`, async () => {
      let release!: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      let started = false;
      let completed = false;
      const user = BaseCallbackHandler.fromMethods({
        async handleLLMEnd() {
          started = true;
          await gate;
          completed = true;
        },
      });
      expect(user.awaitHandlers).toBe(false);
      const original =
        kind === 'array' ? [user] : new CallbackManager('parent-run');
      if (!Array.isArray(original)) original.addHandler(user);
      const callbacks = agentUsageCallbacks(
        original,
        span,
        diag,
        CallbackManager
      );
      const manager = await CallbackManager.configure(callbacks);
      const [run] = await manager!.handleLLMStart(
        { lc: 1, type: 'not_implemented', id: ['test'] },
        ['prompt'],
        'model-run'
      );
      await awaitAllCallbacks();
      try {
        await run.handleLLMEnd(result);
        expect(started).toBe(true);
        expect(completed).toBe(false);
        expect(user.awaitHandlers).toBe(false);
        span.end();
        expect(exporter.getFinishedSpans()[0].attributes).toEqual({
          'gen_ai.usage.input_tokens': 3,
          'gen_ai.usage.output_tokens': 5,
          'gen_ai.response.finish_reasons': ['stop'],
        });
        expect(callbacks).not.toBe(original);
        expect(Array.isArray(original) ? original : original.handlers).toEqual([
          user,
        ]);
        expect(manager!.handlers[0]).toBe(user);
        if (!Array.isArray(original)) {
          expect(original.inheritableHandlers).toEqual([user]);
          expect(run.parentRunId).toBe('parent-run');
        }
      } finally {
        release();
        await awaitAllCallbacks();
      }
      expect(completed).toBe(true);
    });
  }

  it('creates a real SDK handler that retains its scheduling when copied', async () => {
    const callbacks = agentUsageCallbacks(
      undefined,
      span,
      diag,
      CallbackManager
    ) as BaseCallbackHandler[];
    const [observer] = callbacks;
    expect(observer).toBeInstanceOf(BaseCallbackHandler);
    expect(observer.awaitHandlers).toBe(true);
    expect(observer.copy().awaitHandlers).toBe(true);
    const manager = await CallbackManager.configure(callbacks);
    expect(manager!.handlers[0]).toBe(observer);
  });

  it('creates a span-specific handler name that survives SDK copies', () => {
    const observer = createAgentUsageHandler(span, diag, CallbackManager);
    const copy = observer.copy();
    expect(observer).toBeInstanceOf(BaseCallbackHandler);
    expect(observer.name).toBe(
      `opentelemetry-langchain-agent-usage-${span.spanContext().spanId}`
    );
    expect(copy).not.toBe(observer);
    expect(copy.name).toBe(observer.name);
    expect(copy.awaitHandlers).toBe(true);
    expect(createAgentUsageHandler(span, diag, CallbackManager).name).toBe(
      observer.name
    );
    const otherSpan = provider.getTracer('agent-usage-test').startSpan('other');
    try {
      expect(
        createAgentUsageHandler(otherSpan, diag, CallbackManager).name
      ).not.toBe(observer.name);
    } finally {
      otherSpan.end();
    }
  });

  it('preserves user method objects and callback identities in a new array', () => {
    const methods: CallbackHandlerMethods = {
      handleLLMEnd() {},
    };
    const user = BaseCallbackHandler.fromMethods({});
    user.awaitHandlers = true;
    const original = [methods, user];
    Object.freeze(methods);
    Object.freeze(original);
    const callbacks = agentUsageCallbacks(
      original,
      span,
      diag,
      CallbackManager
    ) as (CallbackHandlerMethods | BaseCallbackHandler)[];
    expect(callbacks).not.toBe(original);
    expect(callbacks).toHaveLength(3);
    expect(callbacks[0]).toBe(methods);
    expect(callbacks[1]).toBe(user);
    expect(original).toEqual([methods, user]);
    expect(user.awaitHandlers).toBe(true);
    expect(Object.keys(methods)).toEqual(['handleLLMEnd']);
  });

  it('preserves parent ID, handler inheritance, tags and metadata on a manager copy', async () => {
    const user = BaseCallbackHandler.fromMethods({});
    const local = BaseCallbackHandler.fromMethods({});
    const original = new CallbackManager('parent-run');
    original.addHandler(user, true);
    original.addHandler(local, false);
    original.addTags(['inherited'], true);
    original.addTags(['local'], false);
    original.addMetadata({ inherited: 1 }, true);
    original.addMetadata({ local: 2 }, false);
    const callbacks = agentUsageCallbacks(
      original,
      span,
      diag,
      CallbackManager
    ) as CallbackManager;
    expect(callbacks).not.toBe(original);
    expect(callbacks.getParentRunId()).toBe('parent-run');
    expect(callbacks.handlers.slice(0, 2)).toEqual([user, local]);
    expect(callbacks.handlers[0]).toBe(user);
    expect(callbacks.handlers[1]).toBe(local);
    const observer = callbacks.handlers[2];
    expect(callbacks.inheritableHandlers).toEqual([user, observer]);
    expect(callbacks.tags).toEqual(['inherited', 'local']);
    expect(callbacks.inheritableTags).toEqual(['inherited']);
    expect(callbacks.metadata).toEqual({ inherited: 1, local: 2 });
    expect(callbacks.inheritableMetadata).toEqual({ inherited: 1 });
    const run = await callbacks.handleChainStart(
      { lc: 1, type: 'not_implemented', id: ['test'] },
      {},
      'child-run'
    );
    const child = run.getChild();
    expect(child.getParentRunId()).toBe('child-run');
    expect(child.handlers).toEqual([user, observer]);
    expect(original.handlers).toEqual([user, local]);
    expect(original.inheritableHandlers).toEqual([user]);
    callbacks.addTags(['new']);
    callbacks.addMetadata({ new: 3 });
    expect(original.tags).toEqual(['inherited', 'local']);
    expect(original.inheritableTags).toEqual(['inherited']);
    expect(original.metadata).toEqual({ inherited: 1, local: 2 });
    expect(original.inheritableMetadata).toEqual({ inherited: 1 });
  });

  it('deduplicates model run IDs and sums distinct runs', async () => {
    const [observer] = agentUsageCallbacks(
      undefined,
      span,
      diag,
      CallbackManager
    ) as BaseCallbackHandler[];
    await observer.handleLLMEnd!(result, 'first');
    await observer.handleLLMEnd!(result, 'first');
    await observer.copy().handleLLMEnd!(result, 'first');
    await observer.handleLLMEnd!(result, 'second');
    span.end();
    await observer.handleLLMEnd!(result, 'after-end');
    expect(exporter.getFinishedSpans()[0].attributes).toEqual({
      'gen_ai.usage.input_tokens': 6,
      'gen_ai.usage.output_tokens': 10,
      'gen_ai.response.finish_reasons': ['stop', 'stop'],
    });
  });

  it('preserves repeated finish reasons in generation and run order', async () => {
    const observer = createAgentUsageHandler(span, diag, CallbackManager);
    const multiple: LLMResult = {
      generations: [
        [
          { text: 'first', generationInfo: { finish_reason: 'stop' } },
          { text: 'second', generationInfo: { finish_reason: 'length' } },
        ],
        [{ text: 'third', generationInfo: { finish_reason: 'stop' } }],
      ],
    };
    await observer.handleLLMEnd!(multiple, 'first-run');
    await observer.copy().handleLLMEnd!(multiple, 'first-run');
    await observer.handleLLMEnd!(result, 'second-run');
    span.end();
    expect(
      exporter.getFinishedSpans()[0].attributes[
        'gen_ai.response.finish_reasons'
      ]
    ).toEqual(['stop', 'length', 'stop', 'stop']);
  });

  for (const source of ['tokenUsage', 'usage', 'estimatedTokenUsage']) {
    it(`preserves the donated ${source} input/output usage shape`, async () => {
      const observer = createAgentUsageHandler(span, diag, CallbackManager);
      const counts =
        source === 'usage'
          ? { input_tokens: 2, output_tokens: 4, total_tokens: 99 }
          : { promptTokens: 2, completionTokens: 4, totalTokens: 99 };
      await observer.handleLLMEnd!(
        { generations: [], llmOutput: { [source]: counts } },
        'usage-run'
      );
      span.end();
      expect(exporter.getFinishedSpans()[0].attributes).toEqual({
        'gen_ai.usage.input_tokens': 2,
        'gen_ai.usage.output_tokens': 4,
      });
    });
  }

  it('prefers actual usage over SDK estimates and accepts missing totals', async () => {
    const observer = createAgentUsageHandler(span, diag, CallbackManager);
    await observer.handleLLMEnd!(
      {
        generations: [],
        llmOutput: {
          usage: { input_tokens: 2, output_tokens: 4 },
          estimatedTokenUsage: { promptTokens: 50, completionTokens: 60 },
        },
      },
      'actual-run'
    );
    span.end();
    expect(exporter.getFinishedSpans()[0].attributes).toEqual({
      'gen_ai.usage.input_tokens': 2,
      'gen_ai.usage.output_tokens': 4,
    });
  });

  it('omits missing or malformed usage without changing callback behavior', async () => {
    const observer = createAgentUsageHandler(span, diag, CallbackManager);
    for (const [index, output] of [
      undefined,
      { generations: [] },
      { generations: [], llmOutput: null },
      { generations: [], llmOutput: { tokenUsage: 'invalid' } },
      { generations: [], llmOutput: { tokenUsage: null } },
      { generations: [], llmOutput: {} },
      { generations: [null] },
    ].entries()) {
      await expect(
        Promise.resolve(
          Reflect.apply(observer.handleLLMEnd!, observer, [
            output,
            `malformed-${index}`,
          ])
        )
      ).resolves.toBeUndefined();
    }
    span.end();
    expect(exporter.getFinishedSpans()[0].attributes).toEqual({});
  });

  it('records only finite nonnegative integral token counts', async () => {
    const observer = createAgentUsageHandler(span, diag, CallbackManager);
    for (const [index, value] of ['2', NaN, Infinity, -1, 1.5].entries()) {
      await observer.handleLLMEnd!(
        {
          generations: [],
          llmOutput: {
            tokenUsage: { promptTokens: value, completionTokens: value },
          },
        },
        `invalid-${index}`
      );
    }
    await observer.handleLLMEnd!(
      {
        generations: [],
        llmOutput: { usage: { input_tokens: 0, output_tokens: 3 } },
      },
      'valid'
    );
    span.end();
    expect(exporter.getFinishedSpans()[0].attributes).toEqual({
      'gen_ai.usage.input_tokens': 0,
      'gen_ai.usage.output_tokens': 3,
    });
  });
});
