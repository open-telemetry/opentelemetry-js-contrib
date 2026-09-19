/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import { expect } from 'expect';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import {
  RunnableLambda,
  RunnableMap,
  RunnableSequence,
} from '@langchain/core/runnables';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { DynamicTool } from '@langchain/core/tools';
import { IterableReadableStream } from '@langchain/core/utils/stream';
import {
  createAgent,
  createMiddleware,
  modelFallbackMiddleware,
  providerStrategy,
} from 'langchain';

class LocalChatModel extends BaseChatModel {
  calls = 0;

  constructor(
    readonly model = 'static-model',
    private readonly response = 'answer',
    private readonly failure?: Error
  ) {
    super({});
  }

  override _llmType() {
    return 'local-regression-model';
  }

  override bindTools() {
    return this;
  }

  override async _generate(): Promise<ChatResult> {
    this.calls++;
    if (this.failure) throw this.failure;
    return {
      generations: [
        { text: this.response, message: new AIMessage(this.response) },
      ],
    };
  }
}

const input = () => ({ messages: [new HumanMessage('question')] });

function localAgent() {
  return createAgent({
    name: 'configured-agent',
    model: new LocalChatModel(),
    tools: [],
  });
}

describe('LangChain migration regressions', () => {
  before(function () {
    if (Number(process.versions.node.split('.')[0]) < 20) this.skip();
  });

  beforeEach(() => {
    instrumentation.setConfig({ captureMessageContent: false });
    instrumentation.enable();
    resetMemoryExporter();
  });

  afterEach(() => {
    instrumentation.disable();
  });

  for (const streaming of [false, true]) {
    it(`keeps configured streaming stages as siblings (streaming=${streaming})`, async () => {
      const stage = (name: string) =>
        RunnableSequence.from([
          RunnableLambda.from((value: string) => value),
          RunnableLambda.from((value: string) => value),
        ]).withConfig({ runName: name });
      const outer = RunnableSequence.from([stage('first'), stage('second')], {
        name: 'outer',
      });
      if (streaming) {
        for await (const chunk of await outer.stream('question'))
          expect(chunk).toBe('question');
      } else {
        expect(await outer.invoke('question')).toBe('question');
      }
      const spans = getTestSpans();
      expect(spans).toHaveLength(3);
      const parent = spans.find(span => span.name === 'invoke_workflow outer')!;
      for (const name of ['first', 'second']) {
        expect(
          spans.find(span => span.name === `invoke_workflow ${name}`)
            ?.parentSpanContext?.spanId
        ).toBe(parent.spanContext().spanId);
      }
    });

    it(`excludes inherited observers from suppressed model runs (streaming=${streaming})`, async () => {
      class UsageModel extends LocalChatModel {
        override async _generate(): Promise<ChatResult> {
          return {
            generations: [
              {
                text: 'answer',
                message: new AIMessage({
                  content: 'answer',
                  usage_metadata: {
                    input_tokens: 7,
                    output_tokens: 3,
                    total_tokens: 10,
                  },
                  response_metadata: { finish_reason: 'stop' },
                }),
              },
            ],
          };
        }
      }
      let userCallbacks = 0;
      const hidden = new UsageModel();
      const agent = createAgent({
        model: new UsageModel(),
        tools: [],
        middleware: [
          createMiddleware({
            name: 'suppressed-work',
            beforeModel: async () => {
              await context.with(suppressTracing(context.active()), () =>
                hidden.invoke([new HumanMessage('not traced')])
              );
              return {};
            },
          }),
        ],
      });
      const config = {
        callbacks: [
          {
            handleLLMEnd: () => {
              userCallbacks++;
            },
          },
        ],
      };
      if (streaming) {
        for await (const chunk of await agent.stream(input(), config))
          expect(chunk).toBeDefined();
      } else {
        await agent.invoke(input(), config);
      }
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(userCallbacks).toBe(2);
      expect(getTestSpans()).toHaveLength(1);
      expect(getTestSpans()[0].attributes).toMatchObject({
        'gen_ai.usage.input_tokens': 7,
        'gen_ai.usage.output_tokens': 3,
        'gen_ai.response.finish_reasons': ['stop'],
      });
    });
  }

  for (const streaming of [false, true]) {
    it(`records recovered recursive workflow failures (streaming=${streaming})`, async () => {
      const error = new TypeError('inner failure');
      const workflow: Runnable<string, string> = RunnableSequence.from([
        RunnableLambda.from(async (value: string) => {
          if (value === 'inner') throw error;
          if (streaming) {
            await expect(
              (async () => {
                async function* input() {
                  yield 'inner';
                }
                for await (const chunk of workflow.transform(input(), {
                  runName: 'inner',
                }))
                  expect(chunk).toBeDefined();
              })()
            ).rejects.toBe(error);
          } else {
            await expect(
              workflow.invoke('inner', { runName: 'inner' })
            ).rejects.toBe(error);
          }
          return 'recovered';
        }),
        RunnableLambda.from((value: string) => value),
      ]);
      if (streaming) {
        for await (const chunk of await workflow.stream('outer', {
          runName: 'outer',
        }))
          expect(chunk).toBe('recovered');
      } else {
        expect(await workflow.invoke('outer', { runName: 'outer' })).toBe(
          'recovered'
        );
      }
      const spans = getTestSpans();
      expect(spans.map(span => span.name)).toEqual([
        'invoke_workflow inner',
        'invoke_workflow outer',
      ]);
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
      expect(spans[0].attributes['error.type']).toBe('TypeError');
      expect(spans[0].parentSpanContext?.spanId).toBe(
        spans[1].spanContext().spanId
      );
      expect(spans[1].status.code).toBe(SpanStatusCode.UNSET);
    });
  }

  it('deduplicates SDK tool handoffs without hiding recursive legacy calls', async () => {
    const error = new TypeError('inner tool failure');
    const tool: DynamicTool = new DynamicTool({
      name: 'recursive-tool',
      description: 'Re-enter the same tool and recover.',
      func: async value => {
        if (value === 'inner') throw error;
        await expect(tool.call('inner')).rejects.toBe(error);
        return 'recovered';
      },
    });
    expect(await tool.invoke('outer')).toBe('recovered');
    const spans = getTestSpans();
    expect(spans).toHaveLength(2);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].parentSpanContext?.spanId).toBe(
      spans[1].spanContext().spanId
    );
    expect(spans[1].status.code).toBe(SpanStatusCode.UNSET);
  });

  it('preserves scoped tracing suppression in a nested readable stream', async () => {
    let toolCalls = 0;
    const tool = new DynamicTool({
      name: 'suppressed-tool',
      description: 'Echo without tracing',
      func: async (value: string) => {
        toolCalls++;
        return value;
      },
    });
    const workflow = RunnableSequence.from([
      RunnableLambda.from((value: string) => value),
      RunnableLambda.from(async (value: string) => {
        await context.with(suppressTracing(context.active()), async () => {
          const stream = IterableReadableStream.fromAsyncGenerator(
            (async function* () {
              yield await tool.invoke(value);
            })()
          );
          for await (const chunk of stream) expect(chunk).toBe(value);
        });
        return value;
      }),
    ]).withConfig({ runName: 'scoped-suppression' });

    const chunks: string[] = [];
    for await (const chunk of await workflow.stream('test')) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['test']);
    expect(toolCalls).toBe(1);
    expect(getTestSpans().map(span => span.name)).toEqual([
      'invoke_workflow scoped-suppression',
    ]);
    expect(trace.getSpan(context.active())).toBeUndefined();
  });

  it('preserves a newer active child span in a nested readable stream', async () => {
    const tracer = trace.getTracer('migration-regressions');
    const tool = new DynamicTool({
      name: 'child-tool',
      description: 'Echo beneath an application span',
      func: async (value: string) => value,
    });
    const workflow = RunnableSequence.from([
      RunnableLambda.from((value: string) => value),
      RunnableLambda.from(async (value: string) =>
        tracer.startActiveSpan('application-child', async span => {
          try {
            const stream = IterableReadableStream.fromAsyncGenerator(
              (async function* () {
                yield await tool.invoke(value);
              })()
            );
            for await (const chunk of stream) expect(chunk).toBe(value);
            return value;
          } finally {
            span.end();
          }
        })
      ),
    ]).withConfig({ runName: 'newer-parent' });

    for await (const chunk of await workflow.stream('test')) {
      expect(chunk).toBe('test');
    }
    const spans = getTestSpans();
    expect(spans).toHaveLength(3);
    const outer = spans.find(s => s.name === 'invoke_workflow newer-parent')!;
    const child = spans.find(s => s.name === 'application-child')!;
    const toolSpan = spans.find(s => s.name === 'execute_tool child-tool')!;
    expect(child.parentSpanContext?.spanId).toBe(outer.spanContext().spanId);
    expect(toolSpan.parentSpanContext?.spanId).toBe(child.spanContext().spanId);
    expect(trace.getSpan(context.active())).toBeUndefined();
  });

  for (const kind of ['sequence', 'map'] as const) {
    for (const streaming of [false, true]) {
      it(`preserves nested ${kind} workflow boundaries (streaming=${streaming})`, async () => {
        const tracer = trace.getTracer('migration-regressions');
        const identity = RunnableLambda.from((value: string) => value);
        const leaf = RunnableLambda.from((value: string) => {
          tracer.startSpan('application-leaf').end();
          return value.toUpperCase();
        }).withConfig({ runName: 'standalone-lambda' });
        const inner: Runnable<string, unknown> = (
          kind === 'sequence'
            ? RunnableSequence.from([identity, leaf])
            : RunnableMap.from<string, { answer: string }>({ answer: leaf })
        ).withConfig({ runName: 'inner' });
        const outer = RunnableSequence.from<string, unknown>([
          identity,
          inner,
        ]).withConfig({ runName: 'outer' });
        const expected = kind === 'sequence' ? 'TEST' : { answer: 'TEST' };
        const parent = tracer.startSpan('request');
        try {
          await context.with(
            trace.setSpan(context.active(), parent),
            async () => {
              if (streaming) {
                const chunks: unknown[] = [];
                for await (const chunk of await outer.stream('test')) {
                  chunks.push(chunk);
                }
                expect(chunks).toEqual([expected]);
              } else {
                expect(await outer.invoke('test')).toEqual(expected);
              }
            }
          );
        } finally {
          parent.end();
        }

        const spans = getTestSpans();
        expect(spans.map(span => span.name).sort()).toEqual([
          'application-leaf',
          'invoke_workflow inner',
          'invoke_workflow outer',
          'request',
        ]);
        const outerSpan = spans.find(s => s.name === 'invoke_workflow outer')!;
        const innerSpan = spans.find(s => s.name === 'invoke_workflow inner')!;
        const leafSpan = spans.find(s => s.name === 'application-leaf')!;
        expect(outerSpan.parentSpanContext?.spanId).toBe(
          parent.spanContext().spanId
        );
        expect(innerSpan.parentSpanContext?.spanId).toBe(
          outerSpan.spanContext().spanId
        );
        expect(leafSpan.parentSpanContext?.spanId).toBe(
          innerSpan.spanContext().spanId
        );
        expect(trace.getSpan(context.active())).toBeUndefined();
      });
    }
  }

  for (const streaming of [false, true]) {
    for (const enabledAtCreation of [true, false]) {
      it(`records effective immutable agent conversation defaults (streaming=${streaming}, enabledAtCreation=${enabledAtCreation})`, async function () {
        if (!enabledAtCreation) instrumentation.disable();
        const original = localAgent();
        if (typeof original.withConfig !== 'function') this.skip();
        const defaults = { metadata: { session_id: 'default-session' } };
        const metadataAgent = original.withConfig(defaults);
        const configured = metadataAgent.withConfig({
          configurable: { thread_id: 'default-thread' },
        });
        if (!enabledAtCreation) instrumentation.enable();
        expect(metadataAgent).not.toBe(original);
        expect(configured).not.toBe(metadataAgent);
        let invocations = 0;
        const run = async (
          instance: ReturnType<typeof localAgent>,
          expectedConversation: string | undefined,
          options?: RunnableConfig
        ) => {
          if (streaming) {
            const stream = await instance.stream(input(), {
              ...options,
              streamMode: 'values',
            });
            let answer: unknown;
            for await (const state of stream) {
              answer = state.messages.at(-1)?.content;
            }
            expect(answer).toBe('answer');
          } else {
            expect(
              (await instance.invoke(input(), options)).messages.at(-1)?.content
            ).toBe('answer');
          }
          const spans = getTestSpans();
          expect(spans).toHaveLength(++invocations);
          expect(spans.at(-1)!.name).toBe('invoke_agent configured-agent');
          expect(spans.at(-1)!.attributes['gen_ai.conversation.id']).toBe(
            expectedConversation
          );
        };

        await run(metadataAgent, 'default-session');
        await run(configured, 'default-thread');
        await run(configured, 'invocation-thread', {
          configurable: { thread_id: 'invocation-thread' },
          metadata: { session_id: 'invocation-session' },
        });
        await run(metadataAgent, 'invocation-session', {
          metadata: { session_id: 'invocation-session' },
        });
        await run(configured, 'default-thread', {
          metadata: { session_id: 'invocation-session' },
        });
        await run(metadataAgent, 'default-session');
        await run(configured, 'default-thread');
        await run(original, undefined);
        expect(defaults).toEqual({
          metadata: { session_id: 'default-session' },
        });
      });
    }

    it(`records the supplied agent description and ordinary name (streaming=${streaming})`, async () => {
      instrumentation.setConfig({ captureMessageContent: true });
      const instance = createAgent({
        name: 'described-agent',
        description: 'Answer deterministic regression questions',
        model: new LocalChatModel(),
        tools: [],
      });
      if (streaming) {
        for await (const state of await instance.stream(input(), {
          streamMode: 'values',
        })) {
          expect(state.messages).toBeDefined();
        }
      } else {
        expect((await instance.invoke(input())).messages.at(-1)?.content).toBe(
          'answer'
        );
      }
      expect(getTestSpans()).toHaveLength(1);
      const span = getTestSpans()[0];
      expect(span.name).toBe('invoke_agent described-agent');
      expect(span.attributes['gen_ai.agent.name']).toBe('described-agent');
      expect(span.attributes['gen_ai.agent.description']).toBe(
        'Answer deterministic regression questions'
      );
    });

    for (const selection of ['dynamic', 'fallback'] as const) {
      it(`does not misattribute ${selection} middleware model calls (streaming=${streaming})`, async () => {
        const initial = new LocalChatModel(
          'initial-model',
          'initial answer',
          selection === 'fallback'
            ? new Error('initial model failed')
            : undefined
        );
        const selected = new LocalChatModel(
          'selected-model',
          'selected answer'
        );
        const middleware =
          selection === 'dynamic'
            ? createMiddleware({
                name: 'SelectModel',
                wrapModelCall: (request, handler) =>
                  handler({ ...request, model: selected }),
              })
            : modelFallbackMiddleware(selected);
        const instance = createAgent({
          name: 'selected-agent',
          model: initial,
          tools: [],
          middleware: [middleware],
        });
        if (streaming) {
          let answer: unknown;
          for await (const state of await instance.stream(input(), {
            streamMode: 'values',
          })) {
            answer = state.messages.at(-1)?.content;
          }
          expect(answer).toBe('selected answer');
        } else {
          expect(
            (await instance.invoke(input())).messages.at(-1)?.content
          ).toBe('selected answer');
        }
        expect(initial.calls).toBe(selection === 'fallback' ? 1 : 0);
        expect(selected.calls).toBe(1);
        expect(getTestSpans()).toHaveLength(1);
        expect(
          getTestSpans()[0].attributes['gen_ai.request.model']
        ).toBeUndefined();
      });
    }

    it(`keeps statically known model attribution (streaming=${streaming})`, async () => {
      const instance = localAgent();
      if (streaming) {
        for await (const state of await instance.stream(input(), {
          streamMode: 'values',
        })) {
          expect(state.messages).toBeDefined();
        }
      } else {
        await instance.invoke(input());
      }
      expect(getTestSpans()).toHaveLength(1);
      expect(getTestSpans()[0].attributes['gen_ai.request.model']).toBe(
        'static-model'
      );
      expect(
        getTestSpans()[0].attributes['gen_ai.agent.description']
      ).toBeUndefined();
      expect(
        getTestSpans()[0].attributes['gen_ai.output.type']
      ).toBeUndefined();
    });

    it(`records JSON output for an explicit response format (streaming=${streaming})`, async () => {
      class StructuredOutputModel extends LocalChatModel {
        static override lc_name() {
          // Early 1.x SDKs explicitly recognize this native-JSON fake model.
          return 'FakeToolCallingChatModel';
        }
      }
      const instance = createAgent({
        name: 'structured-agent',
        model: new StructuredOutputModel(
          'json-model',
          JSON.stringify('structured answer')
        ),
        tools: [],
        // A JSON scalar also works with SDKs whose agent state only accepts
        // strings for structuredResponse (notably LangChain 1.2.11).
        responseFormat: providerStrategy({
          type: 'string',
        }),
      });
      if (streaming) {
        let response: unknown;
        for await (const state of await instance.stream(input(), {
          streamMode: 'values',
        })) {
          response = state.structuredResponse;
        }
        expect(response).toBe('structured answer');
      } else {
        expect((await instance.invoke(input())).structuredResponse).toBe(
          'structured answer'
        );
      }
      expect(getTestSpans()).toHaveLength(1);
      expect(getTestSpans()[0].attributes['gen_ai.output.type']).toBe('json');
      expect(
        getTestSpans()[0].attributes['gen_ai.output.messages']
      ).toBeUndefined();
    });
  }

  it('preserves one finish reason per generation in model response order', async () => {
    class MultipleGenerationsModel extends LocalChatModel {
      override async _generate(): Promise<ChatResult> {
        return {
          generations: ['stop', 'length', 'stop'].map((reason, index) => ({
            text: `answer ${index}`,
            message: new AIMessage({
              content: `answer ${index}`,
              response_metadata: { finish_reason: reason },
            }),
          })),
        };
      }
    }
    const instance = createAgent({
      name: 'multiple-generations',
      model: new MultipleGenerationsModel(),
      tools: [],
    });
    expect((await instance.invoke(input())).messages.at(-1)?.content).toBe(
      'answer 0'
    );
    expect(getTestSpans()).toHaveLength(1);
    expect(
      getTestSpans()[0].attributes['gen_ai.response.finish_reasons']
    ).toEqual(['stop', 'length', 'stop']);
  });
});
