/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import { ReadableStream } from 'node:stream/web';
import { expect } from 'expect';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { DynamicTool } from '@langchain/core/tools';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { createAgent } from 'langchain';
import { TracerProvider } from '@opentelemetry/sdk-trace';

class LocalModel extends FakeListChatModel {
  override bindTools() {
    return this;
  }

  override async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const result = await super._generate(messages);
    result.generations[0].message = new AIMessage({
      content: result.generations[0].message.content,
      usage_metadata: {
        input_tokens: 7,
        output_tokens: 3,
        total_tokens: 10,
      },
      response_metadata: { finish_reason: 'stop' },
    });
    return result;
  }
}

const input = () => ({ messages: [new HumanMessage('question')] });
const agent = () =>
  createAgent({
    name: 'regression-agent',
    model: new LocalModel({ responses: ['answer'] }),
    tools: [],
  });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('LangChain runtime regressions', function () {
  before(function () {
    if (Number(process.versions.node.split('.')[0]) < 20) this.skip();
  });

  beforeEach(() => {
    instrumentation.setConfig({ captureMessageContent: true });
    instrumentation.enable();
    resetMemoryExporter();
  });

  afterEach(() => {
    instrumentation.disable();
  });

  it('preserves callbacks inherited from an enclosing runnable', async () => {
    const instance = agent();
    let completions = 0;
    await RunnableLambda.from(() => instance.invoke(input())).invoke('test', {
      callbacks: [
        {
          handleLLMEnd() {
            completions++;
          },
        },
      ],
    });
    await delay(20);
    expect(completions).toBe(1);
    expect(getTestSpans()[0].attributes['gen_ai.usage.input_tokens']).toBe(7);
  });

  it('preserves recursion limits configured on the agent', async function () {
    this.timeout(10000);
    let calls = 0;
    class LoopModel extends LocalModel {
      override async _generate(): Promise<ChatResult> {
        const message =
          calls++ < 14
            ? new AIMessage({
                content: '',
                tool_calls: [
                  { id: `call-${calls}`, name: 'step', args: { input: '' } },
                ],
              })
            : new AIMessage('finished');
        return { generations: [{ text: '', message }] };
      }
    }
    const instance = createAgent({
      model: new LoopModel({ responses: [] }),
      tools: [
        new DynamicTool({
          name: 'step',
          description: 'Advance one deterministic round',
          func: async () => 'next',
        }),
      ],
    });
    if (typeof instance.withConfig !== 'function') this.skip();
    const configured = instance.withConfig({ recursionLimit: 80 });
    expect((await configured.invoke(input())).messages.at(-1)?.content).toBe(
      'finished'
    );
    expect(calls).toBe(15);
  });

  it('preserves configured callback precedence over inherited callbacks', async function () {
    if (typeof agent().withConfig !== 'function') this.skip();
    const run = async (enabled: boolean) => {
      if (enabled) instrumentation.enable();
      else instrumentation.disable();
      const calls = { configured: 0, inherited: 0 };
      const instance = agent().withConfig({
        callbacks: [
          {
            handleLLMEnd() {
              calls.configured++;
            },
          },
        ],
      });
      await RunnableLambda.from(() => instance.invoke(input())).invoke('test', {
        callbacks: [
          {
            handleLLMEnd() {
              calls.inherited++;
            },
          },
        ],
      });
      await delay(20);
      return calls;
    };
    const baseline = await run(false);
    expect(await run(true)).toEqual(baseline);
  });

  for (const streaming of [false, true]) {
    it(`records usage without awaiting slow user callbacks (streaming=${streaming})`, async () => {
      const key = 'LANGCHAIN_CALLBACKS_BACKGROUND';
      const previous = process.env[key];
      process.env[key] = 'true';
      let release!: () => void;
      const userCallback = new Promise<void>(resolve => {
        release = resolve;
      });
      const options = {
        callbacks: [
          {
            async handleLLMEnd() {
              await userCallback;
            },
          },
        ],
      };
      try {
        const instance = agent();
        if (streaming) {
          for await (const chunk of await instance.stream(input(), options)) {
            expect(chunk).toBeDefined();
          }
        } else {
          await instance.invoke(input(), options);
        }
        const span = getTestSpans()[0];
        expect(span.attributes['gen_ai.usage.input_tokens']).toBe(7);
        expect(span.attributes['gen_ai.usage.output_tokens']).toBe(3);
        expect(span.attributes['gen_ai.response.finish_reasons']).toEqual([
          'stop',
        ]);
      } finally {
        release();
        await delay(20);
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
      }
    });
  }

  it('does not complete a workflow from an intermediate model stream', async () => {
    const model = new FakeListChatModel({ responses: ['abc'] });
    const failure = new Error('downstream failed');
    const chain = RunnableSequence.from([
      RunnableLambda.from(async (input: string) => {
        let text = '';
        for await (const chunk of await model.stream(input)) {
          text += chunk.content;
        }
        return text;
      }),
      RunnableLambda.from(async function* (text: string) {
        yield text.toUpperCase();
        throw failure;
      }),
    ]);
    const stream = await chain.stream('hello');
    expect(getTestSpans()).toHaveLength(0);
    await expect(
      (async () => {
        for await (const chunk of stream) expect(chunk).toBe('ABC');
      })()
    ).rejects.toBe(failure);
    expect(getTestSpans()).toHaveLength(1);
    expect(getTestSpans()[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(
      getTestSpans()[0].attributes['gen_ai.output.messages']
    ).toBeUndefined();
  });

  it('does not export prefetched agent output after reader cancellation', async () => {
    const stream = await agent().stream(input(), { streamMode: 'values' });
    await delay(30);
    expect(getTestSpans()).toHaveLength(0);
    const reader = stream.getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel();
    reader.releaseLock();
    expect(getTestSpans()).toHaveLength(1);
    expect(
      getTestSpans()[0].attributes['gen_ai.output.messages']
    ).toBeUndefined();
  });

  it('does not treat a read resolved by cancellation as complete output', async () => {
    const chain = RunnableSequence.from([
      RunnableLambda.from((value: string) => value),
      RunnableLambda.from(async function* () {
        yield 'first';
        await delay(30);
        yield 'second';
      }),
    ]);
    const reader = (await chain.stream('input')).getReader();
    expect((await reader.read()).value).toBe('first');
    const pending = reader.read();
    await Promise.all([pending, reader.cancel()]);
    expect(getTestSpans()).toHaveLength(1);
    expect(
      getTestSpans()[0].attributes['gen_ai.output.messages']
    ).toBeUndefined();
  });

  for (const consumption of ['pipeTo', 'pipeThrough', 'tee'] as const) {
    it(`completes workflows consumed through ${consumption}`, async () => {
      const chain = RunnableSequence.from([
        RunnableLambda.from((value: string) => value),
        RunnableLambda.from(async function* () {
          yield 'a';
          yield 'b';
        }),
      ]);
      const stream = await chain.stream('input');
      const chunks: unknown[] = [];
      if (consumption === 'pipeTo') {
        await stream.pipeTo(
          new WritableStream({
            write(chunk) {
              chunks.push(chunk);
            },
          })
        );
      } else if (consumption === 'pipeThrough') {
        const transformed = stream.pipeThrough(new TransformStream());
        const reader = transformed.getReader();
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          chunks.push(chunk.value);
        }
      } else {
        const branches = stream.tee();
        await Promise.all(
          branches.map(async branch => {
            const reader = branch.getReader();
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) break;
              chunks.push(chunk.value);
            }
          })
        );
      }
      expect(chunks.join('')).toBe(consumption === 'tee' ? 'aabb' : 'ab');
      expect(getTestSpans()).toHaveLength(1);
      expect(getTestSpans()[0].status.code).toBe(SpanStatusCode.UNSET);
    });
  }

  it('completes a fully drained transformed tee branch without consuming its sibling', async () => {
    const chain = RunnableSequence.from([
      RunnableLambda.from((value: string) => value),
      RunnableLambda.from(async function* () {
        yield 'a';
        yield 'b';
      }),
    ]);
    const [first, sibling] = (await chain.stream('input')).tee();
    const reader = first.pipeThrough(new TransformStream()).getReader();
    const chunks: unknown[] = [];
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
    }
    const count = getTestSpans().length;
    await sibling.cancel();
    expect(chunks).toEqual(['a', 'b']);
    expect(count).toBe(1);
  });

  it('tracks the exact source through an SSE-encoded agent stream', async () => {
    const [first, sibling] = (
      await agent().stream(input(), {
        encoding: 'text/event-stream',
      })
    ).tee();
    const reader = first.pipeThrough(new TransformStream()).getReader();
    const chunks: unknown[] = [];
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
    }
    const spans = getTestSpans();
    await sibling.cancel();
    expect(chunks.length).toBeGreaterThan(0);
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('invoke_agent regression-agent');
    expect(spans[0].status.code).toBe(SpanStatusCode.UNSET);
    expect(spans[0].attributes['gen_ai.output.messages']).toBeUndefined();
  });

  it('keeps shared agent usage active after a tee branch transform fails', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    class ToolModel extends LocalModel {
      override async _generate(history: BaseMessage[]): Promise<ChatResult> {
        const final = history.at(-1)?._getType() === 'tool';
        const message = new AIMessage({
          content: final ? 'finished' : '',
          tool_calls: final
            ? []
            : [{ id: 'gate-call', name: 'gate', args: { input: '' } }],
          usage_metadata: {
            input_tokens: 7,
            output_tokens: 3,
            total_tokens: 10,
          },
        });
        return { generations: [{ text: '', message }] };
      }
    }
    const instance = createAgent({
      name: 'gated-agent',
      model: new ToolModel({ responses: [] }),
      tools: [
        new DynamicTool({
          name: 'gate',
          description: 'Wait for the sibling consumer',
          func: async () => {
            await gate;
            return 'continue';
          },
        }),
      ],
    });
    const [first, sibling] = (await instance.stream(input())).tee();
    const failure = new Error('branch transform failed');
    const failed = first.pipeThrough(
      new TransformStream({
        transform() {
          throw failure;
        },
      })
    );
    try {
      await expect(failed.getReader().read()).rejects.toBe(failure);
      expect(
        getTestSpans().find(s => s.name === 'invoke_agent gated-agent')
      ).toBeUndefined();
    } finally {
      release();
    }
    const reader = sibling.getReader();
    while (!(await reader.read()).done) {}
    const span = getTestSpans().find(
      s => s.name === 'invoke_agent gated-agent'
    )!;
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.attributes['gen_ai.usage.input_tokens']).toBe(14);
    expect(span.attributes['gen_ai.usage.output_tokens']).toBe(6);
  });

  it('uses the output parser aggregation semantics for cumulative JSON', async () => {
    const chain = RunnableSequence.from([
      RunnableLambda.from(async function* () {
        yield '"a';
        yield 'b';
        yield '"';
      }),
      new JsonOutputParser(),
    ]);
    for await (const chunk of await chain.stream('input')) {
      expect(['a', 'ab']).toContain(chunk);
    }
    expect(
      JSON.parse(String(getTestSpans()[0].attributes['gen_ai.output.messages']))
    ).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'ab' }] },
    ]);
  });

  it('observes values() consumption without ending a preventCancel iterator early', async () => {
    const chain = RunnableSequence.from([
      RunnableLambda.from((value: string) => value),
      RunnableLambda.from(async function* () {
        yield 'first';
        yield 'second';
      }),
    ]);
    const stream = await chain.stream('hello');
    if (!(stream instanceof ReadableStream)) {
      throw new Error('Expected a Node.js ReadableStream');
    }
    for await (const chunk of stream.values({ preventCancel: true })) {
      expect(chunk).toBe('first');
      break;
    }
    expect(getTestSpans()).toHaveLength(0);
    for await (const chunk of stream.values()) expect(chunk).toBe('second');
    expect(getTestSpans()).toHaveLength(1);
    expect(
      JSON.parse(String(getTestSpans()[0].attributes['gen_ai.output.messages']))
    ).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'firstsecond' }] },
    ]);
  });

  for (const streamMode of [
    'messages',
    ['updates', 'messages'],
    ['values', 'updates'],
  ] as const) {
    it(`captures one final response for stream mode ${JSON.stringify(streamMode)}`, async () => {
      const stream = await agent().stream(input(), {
        streamMode:
          typeof streamMode === 'string' ? streamMode : [...streamMode],
      });
      for await (const chunk of stream) expect(chunk).toBeDefined();
      expect(getTestSpans()).toHaveLength(1);
      expect(
        JSON.parse(
          String(getTestSpans()[0].attributes['gen_ai.output.messages'])
        )
      ).toEqual([
        { role: 'assistant', parts: [{ type: 'text', content: 'answer' }] },
      ]);
    });
  }

  it('captures a returnDirect tool response instead of its model request', async () => {
    class ToolModel extends LocalModel {
      override async _generate(): Promise<ChatResult> {
        return {
          generations: [
            {
              text: '',
              message: new AIMessage({
                content: '',
                tool_calls: [
                  {
                    id: 'direct-call',
                    name: 'direct',
                    args: { input: 'value' },
                  },
                ],
              }),
            },
          ],
        };
      }
    }
    const instance = createAgent({
      name: 'direct-agent',
      model: new ToolModel({ responses: [] }),
      tools: [
        new DynamicTool({
          name: 'direct',
          description: 'Returns directly',
          returnDirect: true,
          func: async () => 'actual final tool response',
        }),
      ],
    });
    for await (const chunk of await instance.stream(input())) {
      expect(chunk).toBeDefined();
    }
    const span = getTestSpans().find(
      s => s.name === 'invoke_agent direct-agent'
    )!;
    expect(
      JSON.parse(String(span.attributes['gen_ai.output.messages']))
    ).toEqual([
      {
        role: 'tool',
        parts: [
          {
            type: 'tool_call_response',
            id: 'direct-call',
            response: 'actual final tool response',
          },
        ],
      },
    ]);
  });

  it('contains span-processor failures without changing successful results', async () => {
    const provider = new TracerProvider({
      spanProcessors: [
        {
          onStart() {},
          onEnd() {
            throw new Error('processor failure');
          },
          async forceFlush() {},
          async shutdown() {},
        },
      ],
    });
    instrumentation.setTracerProvider(provider);
    const rejections: unknown[] = [];
    const onRejection = (error: unknown) => rejections.push(error);
    process.on('unhandledRejection', onRejection);
    try {
      const chain = RunnableSequence.from([
        RunnableLambda.from((value: string) => value),
        RunnableLambda.from((value: string) => `${value}!`),
      ]);
      expect(await chain.invoke('ok')).toBe('ok!');
      await delay(20);
      expect(rejections).toHaveLength(0);
    } finally {
      process.removeListener('unhandledRejection', onRejection);
      instrumentation.setTracerProvider(trace.getTracerProvider());
      await provider.shutdown();
    }
  });
});
