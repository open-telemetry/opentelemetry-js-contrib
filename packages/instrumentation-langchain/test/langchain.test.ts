/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import { expect } from 'expect';
import {
  context,
  diag,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import {
  RunnableLambda,
  RunnableSequence,
  RunnableMap,
} from '@langchain/core/runnables';
import { DynamicTool, DynamicStructuredTool } from '@langchain/core/tools';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { CallbackManager } from '@langchain/core/callbacks/manager';
import { createAgent } from 'langchain';
import { messages } from '../src/content';
import * as sinon from 'sinon';

class LocalChatModel extends FakeListChatModel {
  override bindTools() {
    return this;
  }
}

function workflow() {
  return RunnableSequence.from([
    RunnableLambda.from((input: string) => input.toUpperCase()),
    RunnableLambda.from((input: string) => `${input}!`),
  ]).withConfig({ runName: 'greeting' });
}

describe('LangChain public operations', () => {
  before(function () {
    // LangChain 1.x requires Node.js 20 or later.
    if (Number(process.versions.node.split('.')[0]) < 20) this.skip();
  });

  beforeEach(() => {
    instrumentation.setConfig({ captureMessageContent: false });
    instrumentation.enable();
    resetMemoryExporter();
  });

  afterEach(() => {
    instrumentation.disable();
    sinon.restore();
  });

  it('traces a workflow with official conventions and no content by default', async () => {
    expect(await workflow().invoke('private input')).toBe('PRIVATE INPUT!');
    const spans = getTestSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('invoke_workflow greeting');
    expect(spans[0].kind).toBe(SpanKind.INTERNAL);
    expect(spans[0].status.code).toBe(SpanStatusCode.UNSET);
    expect(spans[0].attributes).toEqual({
      'gen_ai.operation.name': 'invoke_workflow',
      'gen_ai.workflow.name': 'greeting',
    });
  });

  it('does not instrument standalone lambdas, prompts or delegated model calls', async () => {
    await RunnableLambda.from((x: string) => x).invoke('test');
    await new FakeListChatModel({ responses: ['answer'] }).invoke('question');
    expect(getTestSpans()).toHaveLength(0);
  });

  it('does not emit native OTel spans when disabled', async () => {
    instrumentation.disable();
    await workflow().invoke('test');
    await new DynamicTool({
      name: 'echo',
      description: 'echo',
      func: async x => x,
    }).invoke('test');
    expect(getTestSpans()).toHaveLength(0);
  });

  it('respects tracing suppression', async () => {
    await context.with(suppressTracing(context.active()), () =>
      workflow().invoke('test')
    );
    expect(getTestSpans()).toHaveLength(0);
  });

  it('preserves user callbacks and makes the workflow active for child spans', async () => {
    const seen: string[] = [];
    const tracer = trace.getTracer('test');
    const parent = tracer.startSpan('parent');
    const chain = RunnableSequence.from([
      RunnableLambda.from(async (input: string) => {
        await Promise.resolve();
        tracer.startSpan('provider').end();
        return input;
      }),
      RunnableLambda.from((input: string) => input),
    ]);
    await context.with(trace.setSpan(context.active(), parent), () =>
      chain.invoke('test', {
        callbacks: [
          {
            handleChainStart: () => {
              seen.push('start');
            },
          },
        ],
      })
    );
    parent.end();
    const spans = getTestSpans();
    const workflowSpan = spans.find(
      s => s.attributes['gen_ai.operation.name'] === 'invoke_workflow'
    )!;
    expect(workflowSpan.parentSpanContext?.spanId).toBe(
      parent.spanContext().spanId
    );
    expect(
      spans.find(s => s.name === 'provider')!.parentSpanContext?.spanId
    ).toBe(workflowSpan.spanContext().spanId);
    expect(seen).toHaveLength(3);
    expect(trace.getSpan(context.active())).toBeUndefined();
  });

  it('captures workflow content only when enabled', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    await workflow().invoke('hello', {
      configurable: { thread_id: 'test-thread' },
    });
    const attrs = getTestSpans()[0].attributes;
    expect(attrs['gen_ai.conversation.id']).toBe('test-thread');
    expect(JSON.parse(String(attrs['gen_ai.input.messages']))).toEqual([
      { role: 'user', parts: [{ type: 'text', content: 'hello' }] },
    ]);
    expect(JSON.parse(String(attrs['gen_ai.output.messages']))).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'HELLO!' }] },
    ]);
  });

  for (const key of ['session_id', 'thread_id', 'conversation_id']) {
    it(`maps ${key} metadata without copying arbitrary metadata`, async () => {
      await workflow().invoke('test', {
        metadata: { [key]: 'generated-session', private: 'not recorded' },
      });
      expect(getTestSpans()[0].attributes['gen_ai.conversation.id']).toBe(
        'generated-session'
      );
      expect(JSON.stringify(getTestSpans()[0].attributes)).not.toContain(
        'not recorded'
      );
    });
  }

  it('prefers framework conversation configuration over metadata aliases', async () => {
    await workflow().invoke('test', {
      configurable: { thread_id: 'configured-session' },
      metadata: {
        session_id: 'metadata-session',
        thread_id: 'metadata-thread',
      },
    });
    expect(getTestSpans()[0].attributes['gen_ai.conversation.id']).toBe(
      'configured-session'
    );
  });

  it('preserves tool results, call IDs and active context without duplicate call spans', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const tool = new DynamicStructuredTool({
      name: 'echo',
      description: 'Echo generated test input',
      schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      func: async (input: { text: string }) => {
        trace.getTracer('test').startSpan('inside tool').end();
        return input.text;
      },
    });
    const result = await tool.invoke({
      type: 'tool_call',
      name: 'echo',
      id: 'test-call',
      args: { text: 'hello' },
    });
    expect(result).toBeInstanceOf(ToolMessage);
    expect(result.content).toBe('hello');
    const span = getTestSpans().find(s => s.name === 'execute_tool echo')!;
    expect(getTestSpans()).toHaveLength(2);
    expect(span.attributes['gen_ai.tool.call.id']).toBe('test-call');
    expect(
      JSON.parse(String(span.attributes['gen_ai.tool.call.arguments']))
    ).toEqual({ text: 'hello' });
    expect(
      JSON.parse(String(span.attributes['gen_ai.tool.call.result']))
    ).toEqual({ content: 'hello' });
    expect(getTestSpans()[0].parentSpanContext?.spanId).toBe(
      span.spanContext().spanId
    );
  });

  it('supports legacy tool.call and default content privacy', async () => {
    const result = { generated: true };
    const tool = new DynamicTool({
      name: 'echo',
      description: 'private description',
      func: async () => result,
    });
    expect(await tool.call('private input')).toBe(result);
    expect(getTestSpans()[0].attributes).toEqual({
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'echo',
      'gen_ai.tool.type': 'function',
    });
  });

  it('preserves the original error and does not capture its sensitive message', async () => {
    const error = new TypeError('private input');
    const tool = new DynamicTool({
      name: 'broken',
      description: '',
      func: async () => {
        throw error;
      },
    });
    await expect(tool.invoke('private')).rejects.toBe(error);
    const span = getTestSpans()[0];
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR });
    expect(span.attributes['error.type']).toBe('TypeError');
    expect(span.events).toHaveLength(0);
    expect(JSON.stringify(span.attributes)).not.toContain('private');
  });

  it('does not let content serialization failures change application output', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const output: Record<string, unknown> = {};
    output.self = output;
    const tool = new DynamicTool({
      name: 'circular',
      description: '',
      func: async () => output,
    });
    expect(await tool.invoke('test')).toBe(output);
    expect(getTestSpans()).toHaveLength(1);
    expect(
      getTestSpans()[0].attributes['gen_ai.tool.call.result']
    ).toBeUndefined();
  });

  it('keeps the SDK stream and completes only after consumption', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const stream = await workflow().stream('hello');
    expect(stream).toBeInstanceOf(ReadableStream);
    expect(getTestSpans()).toHaveLength(0);
    const output: string[] = [];
    for await (const chunk of stream) output.push(chunk);
    expect(output.join('')).toBe('HELLO!');
    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].status.code).toBe(SpanStatusCode.UNSET);
  });

  it('ends early-terminated streams without claiming an error or complete output', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const chain = RunnableSequence.from([
      RunnableLambda.from((x: string) => x),
      RunnableLambda.from(async function* () {
        yield 'first';
        yield 'second';
      }),
    ]);
    const stream = await chain.stream('test');
    for await (const chunk of stream) {
      expect(chunk).toBe('first');
      break;
    }
    expect(getTestSpans()).toHaveLength(1);
    expect(
      getTestSpans()[0].attributes['gen_ai.output.messages']
    ).toBeUndefined();
  });

  it('ends stream errors and preserves the original failure', async () => {
    const error = new Error('generated failure');
    const chain = RunnableSequence.from([
      RunnableLambda.from((x: string) => x),
      RunnableLambda.from(async function* () {
        yield 'first';
        throw error;
      }),
    ]);
    await expect(
      (async () => {
        const stream = await chain.stream('test');
        for await (const chunk of stream) expect(chunk).toBe('first');
      })()
    ).rejects.toBe(error);
    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].status.code).toBe(SpanStatusCode.ERROR);
  });

  it('supports ReadableStream reader consumption and cancellation', async () => {
    const stream = await workflow().stream('hello');
    const reader = stream.getReader();
    expect((await reader.read()).value).toBe('HELLO!');
    await reader.cancel();
    reader.releaseLock();
    expect(getTestSpans()).toHaveLength(1);
  });

  it('traces parallel workflows without leaking context between invocations', async () => {
    const map = RunnableMap.from({
      first: workflow(),
      second: workflow(),
    });
    expect(await map.invoke('hello')).toEqual({
      first: 'HELLO!',
      second: 'HELLO!',
    });
    const spans = getTestSpans();
    expect(spans).toHaveLength(3);
    const parent = spans.find(
      s => s.attributes['gen_ai.workflow.name'] === 'RunnableMap'
    )!;
    for (const child of spans.filter(s => s !== parent)) {
      expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
    }
  });

  it('observes the optimized batch without replacing it with invoke calls', async () => {
    const first = RunnableLambda.from((input: string) => input.toUpperCase());
    const chain = RunnableSequence.from([
      first,
      RunnableLambda.from((input: string) => `${input}!`),
    ]);
    const batch = sinon.spy(first, 'batch');
    expect(await chain.batch(['one', 'two'])).toEqual(['ONE!', 'TWO!']);
    expect(batch.calledOnce).toBe(true);
    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].attributes['gen_ai.operation.name']).toBe(
      'invoke_workflow'
    );
  });

  it('preserves the exact Promise subclass returned by a public boundary', async () => {
    class SDKPromise extends Promise<string> {
      marker = 'custom SDK promise';
    }
    const result = new SDKPromise(resolve => resolve('answer'));
    instrumentation.disable();
    const original = sinon
      .stub(RunnableSequence.prototype, 'invoke')
      .returns(result);
    instrumentation.enable();
    const chain = RunnableSequence.from([
      RunnableLambda.from((x: string) => x),
      RunnableLambda.from((x: string) => x),
    ]);
    expect(chain.invoke('question')).toBe(result);
    expect(await result).toBe('answer');
    expect(original.calledOnce).toBe(true);
    expect(getTestSpans()).toHaveLength(1);
  });

  it('preserves synchronous boundary exceptions', () => {
    const error = new Error('generated synchronous failure');
    instrumentation.disable();
    sinon.stub(RunnableSequence.prototype, 'invoke').throws(error);
    instrumentation.enable();
    const chain = RunnableSequence.from([
      RunnableLambda.from((x: string) => x),
      RunnableLambda.from((x: string) => x),
    ]);
    expect(() => chain.invoke('test')).toThrow(error);
    expect(getTestSpans()[0].attributes['error.type']).toBe('Error');
  });

  it('preserves non-Error throws and records a bounded error type', async () => {
    const tool = new DynamicTool({
      name: 'failure',
      description: '',
      func: async () => {
        throw 'generated failure';
      },
    });
    await expect(tool.invoke('test')).rejects.toBe('generated failure');
    expect(getTestSpans()[0].attributes['error.type']).toBe('_OTHER');
  });

  it('preserves AbortSignal cancellation errors', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      workflow().invoke('test', { signal: controller.signal })
    ).rejects.toBe(controller.signal.reason);
    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].attributes['error.type']).toBe('AbortError');
  });

  it('keeps concurrent invocations parented to their own active contexts', async () => {
    const tracer = trace.getTracer('test');
    const parents = [tracer.startSpan('first'), tracer.startSpan('second')];
    await Promise.all(
      parents.map(parent =>
        context.with(trace.setSpan(context.active(), parent), () =>
          workflow().invoke(parent.spanContext().spanId)
        )
      )
    );
    const spans = getTestSpans();
    expect(spans).toHaveLength(2);
    expect(new Set(spans.map(s => s.parentSpanContext?.spanId))).toEqual(
      new Set(parents.map(p => p.spanContext().spanId))
    );
    parents.forEach(parent => parent.end());
  });

  it('keeps enable and disable idempotent and completes in-flight work', async () => {
    instrumentation.enable();
    instrumentation.enable();
    const stream = await workflow().stream('hello');
    instrumentation.disable();
    instrumentation.disable();
    for await (const chunk of stream) expect(chunk).toBe('HELLO!');
    expect(getTestSpans()).toHaveLength(1);
    await workflow().invoke('disabled');
    expect(getTestSpans()).toHaveLength(1);
    instrumentation.enable();
    await workflow().invoke('enabled');
    expect(getTestSpans()).toHaveLength(2);
  });
  it('traces a real createAgent invocation without duplicating the model', async () => {
    const agent = createAgent({
      name: 'test-agent',
      model: new LocalChatModel({ responses: ['generated answer'] }),
      tools: [],
    });
    const result = await agent.invoke({
      messages: [new HumanMessage('generated prompt')],
    });
    expect(result.messages.at(-1)?.content).toBe('generated answer');
    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].name).toBe('invoke_agent test-agent');
  });

  for (const withConfig of [false, true]) {
    it(`captures final agent streaming output without copying the input history (withConfig=${withConfig})`, async function () {
      instrumentation.setConfig({ captureMessageContent: true });
      let agent = createAgent({
        name: 'streaming-agent',
        model: new LocalChatModel({ responses: ['generated answer'] }),
        tools: [],
      });
      if (withConfig) {
        if (typeof agent.withConfig !== 'function') this.skip();
        agent = agent.withConfig({ tags: ['user-hook-tag'] });
      }
      const stream = await agent.stream({
        messages: [new HumanMessage('generated prompt')],
      });
      expect(stream).toBeInstanceOf(ReadableStream);
      for await (const chunk of stream) expect(chunk).toBeDefined();
      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      expect(
        JSON.parse(String(spans[0].attributes['gen_ai.output.messages']))
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'generated answer' }],
        },
      ]);
    });
  }

  it('parents real agent tool execution without duplicating inference', async () => {
    class ToolModel extends LocalChatModel {
      override async _generate(history: BaseMessage[]): Promise<ChatResult> {
        const final = history.at(-1)?._getType() === 'tool';
        const message = final
          ? new AIMessage('generated answer')
          : new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'agent-call',
                  name: 'echo',
                  args: { input: 'generated input' },
                },
              ],
            });
        message.usage_metadata = {
          input_tokens: final ? 5 : 7,
          output_tokens: final ? 3 : 2,
          total_tokens: final ? 8 : 9,
        };
        message.response_metadata = {
          finish_reason: final ? 'stop' : 'tool_calls',
        };
        return { generations: [{ text: '', message }] };
      }
    }
    const tool = new DynamicTool({
      name: 'echo',
      description: 'Echo test data',
      func: async input => input,
    });
    const agent = createAgent({
      name: 'tool-agent',
      model: new ToolModel({ responses: [] }),
      tools: [tool],
    });
    const userCallback = sinon.spy();
    const callbacks = CallbackManager.fromHandlers({
      handleLLMEnd: userCallback,
    });
    const originalHandlers = [...callbacks.handlers];
    const result = await agent.invoke(
      {
        messages: [
          new AIMessage({
            content: 'old response',
            usage_metadata: {
              input_tokens: 1000,
              output_tokens: 1000,
              total_tokens: 2000,
            },
          }),
          new HumanMessage('generated prompt'),
        ],
      },
      { callbacks }
    );
    expect(result.messages.at(-1)?.content).toBe('generated answer');
    const spans = getTestSpans();
    expect(spans).toHaveLength(2);
    const agentSpan = spans.find(s => s.name === 'invoke_agent tool-agent')!;
    const toolSpan = spans.find(s => s.name === 'execute_tool echo')!;
    expect(toolSpan.parentSpanContext?.spanId).toBe(
      agentSpan.spanContext().spanId
    );
    expect(toolSpan.attributes['gen_ai.agent.name']).toBe('tool-agent');
    expect(toolSpan.attributes['gen_ai.tool.call.id']).toBe('agent-call');
    expect(agentSpan.attributes['gen_ai.usage.input_tokens']).toBe(12);
    expect(agentSpan.attributes['gen_ai.usage.output_tokens']).toBe(5);
    expect(agentSpan.attributes['gen_ai.response.finish_reasons']).toEqual([
      'tool_calls',
      'stop',
    ]);
    expect(userCallback.calledTwice).toBe(true);
    expect(callbacks.handlers).toEqual(originalHandlers);
  });

  it('honors an explicitly supplied tracer provider', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
    });
    instrumentation.setTracerProvider(provider);
    try {
      await workflow().invoke('test');
      expect(exporter.getFinishedSpans()).toHaveLength(1);
      expect(getTestSpans()).toHaveLength(0);
    } finally {
      instrumentation.setTracerProvider(trace.getTracerProvider());
      await provider.shutdown();
    }
  });

  it('converts modern message and tool-call shapes without losing roles or arguments', () => {
    expect(
      JSON.parse(
        messages(
          [
            new HumanMessage('question'),
            new AIMessage({
              content: '',
              tool_calls: [
                { id: 'call', name: 'echo', args: { text: 'value' } },
              ],
            }),
            new ToolMessage({ content: 'result', tool_call_id: 'call' }),
          ],
          diag
        )!
      )
    ).toEqual([
      { role: 'user', parts: [{ type: 'text', content: 'question' }] },
      {
        role: 'assistant',
        parts: [
          { type: 'text', content: '' },
          {
            type: 'tool_call',
            id: 'call',
            name: 'echo',
            arguments: { text: 'value' },
          },
        ],
      },
      {
        role: 'tool',
        parts: [{ type: 'tool_call_response', id: 'call', response: 'result' }],
      },
    ]);
  });
});
