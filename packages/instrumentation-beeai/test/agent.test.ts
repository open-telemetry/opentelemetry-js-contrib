/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind } from '@opentelemetry/api';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import {
  ATTR_GEN_AI_TOOL_CALL_ID,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
} from '@opentelemetry/genai-util';
import { expect } from 'expect';
import { z } from 'zod';

import { instrumentation } from './load-instrumentation';
import { BaseAgent } from 'beeai-framework/agents/base';
import { ReActAgent } from 'beeai-framework/agents/react/agent';
import { ToolCallingAgent } from 'beeai-framework/agents/toolCalling/agent';
import {
  ChatModelOutput,
  type ChatModelInput,
} from 'beeai-framework/backend/chat';
import {
  AssistantMessage,
  SystemMessage,
  UserMessage,
} from 'beeai-framework/backend/message';
import { Emitter } from 'beeai-framework/emitter/emitter';
import { UnconstrainedMemory } from 'beeai-framework/memory/unconstrainedMemory';
import {
  DynamicTool,
  StringToolOutput,
  Tool,
} from 'beeai-framework/tools/base';
import { LLMTool } from 'beeai-framework/tools/llm';
import {
  ATTR_GEN_AI_AGENT_DESCRIPTION,
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  CustomAgent,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
  METRIC_GEN_AI_INVOKE_AGENT_DURATION,
  METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS,
  METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS,
  MockChatModel,
  setupBeeAITestSuite,
} from './helpers';

describe('BeeAIInstrumentation - BaseAgent', () => {
  const { getMetricReader } = setupBeeAITestSuite();

  describe('BaseAgent instrumentation (LocalAgentInvocation)', () => {
    it('instruments ReActAgent with nested chat and execute_tool spans and call count metrics', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });

      const weatherTool = new DynamicTool({
        name: 'get_weather',
        description: 'Returns weather for a city',
        inputSchema: z.object({ city: z.string() }),
        handler: async input =>
          new StringToolOutput(`Sunny, 25C in ${input.city}`),
      });

      const llm = new MockChatModel({
        modelId: 'llama3.1',
        providerId: 'ollama',
        parameters: { temperature: 0.2 },
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: I need to check the weather in Rome.',
                    'Function Name: get_weather',
                    'Function Input: {"city":"Rome"}',
                  ].join('\n')
                ),
              ],
              { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
              'stop'
            ),
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: I have the weather information.',
                    'Final Answer: It is Sunny and 25C in Rome.',
                  ].join('\n')
                ),
              ],
              { promptTokens: 65, completionTokens: 15, totalTokens: 80 },
              'stop'
            ),
        ],
      });

      const agent = new ReActAgent({
        llm,
        memory: new UnconstrainedMemory(),
        tools: [weatherTool],
      });

      const response = await agent.run({
        prompt: 'What is the weather in Rome?',
      });
      expect(response.result.text).toBe('It is Sunny and 25C in Rome.');

      const spans = getTestSpans();
      const agentSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      );
      const chatSpans = spans.filter(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      );
      const toolSpans = spans.filter(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      );

      expect(agentSpan).toBeDefined();
      expect(chatSpans).toHaveLength(2);
      expect(toolSpans).toHaveLength(1);

      expect(agentSpan!.name).toBe('invoke_agent ReAct');
      expect(agentSpan!.kind).toBe(SpanKind.INTERNAL);
      expect(agentSpan!.attributes[ATTR_GEN_AI_AGENT_NAME]).toBe('ReAct');
      expect(typeof agentSpan!.attributes[ATTR_GEN_AI_AGENT_DESCRIPTION]).toBe(
        'string'
      );
      expect(agentSpan!.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe('llama3.1');
      expect(agentSpan!.attributes[ATTR_GEN_AI_REQUEST_TEMPERATURE]).toBe(0.2);
      expect(agentSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(105);
      expect(agentSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(35);

      expect(
        JSON.parse(agentSpan!.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is the weather in Rome?' }],
        },
      ]);
      expect(
        JSON.parse(agentSpan!.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'It is Sunny and 25C in Rome.' }],
        },
      ]);

      for (const chatSpan of chatSpans) {
        expect(chatSpan.parentSpanContext?.spanId).toBe(
          agentSpan!.spanContext().spanId
        );
      }

      const toolSpan = toolSpans[0];
      expect(toolSpan.parentSpanContext?.spanId).toBe(
        agentSpan!.spanContext().spanId
      );
      expect(toolSpan.attributes[ATTR_GEN_AI_AGENT_NAME]).toBe('ReAct');
      expect(toolSpan.attributes[ATTR_GEN_AI_TOOL_NAME]).toBe('get_weather');
      expect(
        JSON.parse(
          toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] as string
        )
      ).toEqual({ city: 'Rome' });
      expect(toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT]).toBe(
        'Sunny, 25C in Rome'
      );

      const { resourceMetrics } = await getMetricReader().collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];

      const agentDuration = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_DURATION
      );
      const inferenceCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
      );
      const toolCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      expect(agentDuration?.dataPoints.length).toBe(1);
      expect(inferenceCalls?.dataPoints.length).toBe(1);
      expect(
        (inferenceCalls?.dataPoints[0]?.value as { sum?: number })?.sum
      ).toBe(2);
      expect(toolCalls?.dataPoints.length).toBe(1);
      expect((toolCalls?.dataPoints[0]?.value as { sum?: number })?.sum).toBe(
        1
      );
    });

    it('instruments ToolCallingAgent and propagates toolCallId onto execute_tool spans', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });

      const lookupTool = new DynamicTool({
        name: 'lookup_user',
        description: 'Looks up user by ID',
        inputSchema: z.object({ userId: z.string() }),
        handler: async input =>
          new StringToolOutput(`User ${input.userId} is Alice`),
      });

      const llm = new MockChatModel({
        modelId: 'gpt-4o',
        providerId: 'openai',
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage({
                  type: 'tool-call',
                  toolCallId: 'call_abc123',
                  toolName: 'lookup_user',
                  args: { userId: '42' },
                }),
              ],
              { promptTokens: 30, completionTokens: 12, totalTokens: 42 },
              'tool-calls'
            ),
          (input: ChatModelInput) => {
            const hasFinalAnswerTool = input.tools?.some(
              t => t.name === 'final_answer'
            );
            return new ChatModelOutput(
              [
                hasFinalAnswerTool
                  ? new AssistantMessage({
                      type: 'tool-call',
                      toolCallId: 'call_final999',
                      toolName: 'final_answer',
                      args: { response: 'User 42 is Alice.' },
                    })
                  : new AssistantMessage('User 42 is Alice.'),
              ],
              { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
              hasFinalAnswerTool ? 'tool-calls' : 'stop'
            );
          },
        ],
      });

      const agent = new ToolCallingAgent({
        llm,
        memory: new UnconstrainedMemory(),
        tools: [lookupTool],
      });

      const response = await agent.run({ prompt: 'Who is user 42?' });
      expect(response.result.text).toBe('User 42 is Alice.');

      const spans = getTestSpans();
      const agentSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      );
      const toolSpans = spans.filter(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      );
      const lookupSpan = toolSpans.find(
        s => s.attributes[ATTR_GEN_AI_TOOL_NAME] === 'lookup_user'
      );

      expect(agentSpan).toBeDefined();
      expect(agentSpan!.name).toBe('invoke_agent ToolCalling');
      expect(toolSpans).toHaveLength(1);
      expect(lookupSpan).toBeDefined();
      expect(lookupSpan!.parentSpanContext?.spanId).toBe(
        agentSpan!.spanContext().spanId
      );
      expect(lookupSpan!.attributes[ATTR_GEN_AI_TOOL_CALL_ID]).toBe(
        'call_abc123'
      );
      expect(lookupSpan!.attributes[ATTR_GEN_AI_AGENT_NAME]).toBe(
        'ToolCalling'
      );

      const { resourceMetrics } = await getMetricReader().collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const toolCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      expect((toolCalls?.dataPoints[0]?.value as { sum?: number })?.sum).toBe(
        1
      );
    });

    it('extracts input messages from pre-populated agent memory when prompt is null', async () => {
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      const agent = new CustomAgent();
      await agent.memory.add(new SystemMessage('System rule'));
      await agent.memory.add(new UserMessage('Message from memory'));

      const response = await agent.run({ prompt: null });
      expect(response.result.text).toBe('Handled: Message from memory');

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];
      expect(span.name).toBe('invoke_agent CustomAssistant');
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] as string)
      ).toEqual([{ type: 'text', content: 'System rule' }]);
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'Message from memory' }],
        },
      ]);
      expect(
        JSON.parse(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string)
      ).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Handled: Message from memory' }],
        },
      ]);
    });

    it('does not roll tool-internal ChatModel tokens or inference_calls onto the parent agent span', async () => {
      const helperLlm = new MockChatModel({
        modelId: 'gpt-4o-mini',
        providerId: 'openai',
        responses: [
          () =>
            new ChatModelOutput(
              [new AssistantMessage('Condensed 50-word PDF summary.')],
              { promptTokens: 500, completionTokens: 100, totalTokens: 600 },
              'stop'
            ),
        ],
      });

      const innerHelperTool = new DynamicTool({
        name: 'normalize_text',
        description: 'Internal text normalizer called by summarize_pdf',
        inputSchema: z.object({ raw: z.string() }),
        handler: async input => new StringToolOutput(input.raw.trim()),
      });

      const summarizePdfTool = new DynamicTool({
        name: 'summarize_pdf',
        description: 'Summarizes a large PDF using a helper LLM',
        inputSchema: z.object({ docId: z.string() }),
        handler: async input => {
          const normalized = await innerHelperTool.run({
            raw: `  Contents of ${input.docId}  `,
          });
          const llmRes = await helperLlm.create({
            messages: [new UserMessage(normalized.getTextContent())],
          });
          return new StringToolOutput(llmRes.getTextContent());
        },
      });

      const agentLlm = new MockChatModel({
        modelId: 'claude-3-5-sonnet',
        providerId: 'anthropic',
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: I need to summarize doc_42.',
                    'Function Name: summarize_pdf',
                    'Function Input: {"docId":"doc_42"}',
                  ].join('\n')
                ),
              ],
              { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
              'stop'
            ),
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: I have the summary.',
                    'Final Answer: Condensed 50-word PDF summary.',
                  ].join('\n')
                ),
              ],
              { promptTokens: 65, completionTokens: 15, totalTokens: 80 },
              'stop'
            ),
          // Third response consumed when LLMTool shares the same ChatModel instance.
          () =>
            new ChatModelOutput(
              [new AssistantMessage('Extracted entities: Acme Corp')],
              { promptTokens: 300, completionTokens: 50, totalTokens: 350 },
              'stop'
            ),
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: Done.',
                    'Final Answer: Extracted entities: Acme Corp',
                  ].join('\n')
                ),
              ],
              { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
              'stop'
            ),
        ],
      });

      const agent = new ReActAgent({
        llm: agentLlm,
        memory: new UnconstrainedMemory(),
        tools: [summarizePdfTool],
      });

      const response = await agent.run({ prompt: 'Summarize doc_42' });
      expect(response.result.text).toBe('Condensed 50-word PDF summary.');

      const spans = getTestSpans();
      const agentSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      );
      const chatSpans = spans.filter(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      );
      const toolSpans = spans.filter(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      );

      expect(agentSpan).toBeDefined();
      expect(chatSpans).toHaveLength(3);
      expect(toolSpans).toHaveLength(2);

      // Agent span reports ONLY its own claude-3-5-sonnet turns (40+65=105 in, 20+15=35 out),
      // excluding the helper gpt-4o-mini call (500 in, 100 out).
      expect(agentSpan!.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe(
        'claude-3-5-sonnet'
      );
      expect(agentSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(105);
      expect(agentSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(35);

      const summarizeSpan = toolSpans.find(
        s => s.attributes[ATTR_GEN_AI_TOOL_NAME] === 'summarize_pdf'
      );
      const innerToolSpan = toolSpans.find(
        s => s.attributes[ATTR_GEN_AI_TOOL_NAME] === 'normalize_text'
      );
      const helperChatSpan = chatSpans.find(
        s => s.attributes[ATTR_GEN_AI_REQUEST_MODEL] === 'gpt-4o-mini'
      );

      expect(summarizeSpan).toBeDefined();
      expect(summarizeSpan!.attributes[ATTR_GEN_AI_AGENT_NAME]).toBe('ReAct');
      expect(innerToolSpan).toBeDefined();
      expect(innerToolSpan!.parentSpanContext?.spanId).toBe(
        summarizeSpan!.spanContext().spanId
      );
      expect(innerToolSpan!.attributes[ATTR_GEN_AI_AGENT_NAME]).toBeUndefined();

      expect(helperChatSpan).toBeDefined();
      expect(helperChatSpan!.parentSpanContext?.spanId).toBe(
        summarizeSpan!.spanContext().spanId
      );
      expect(helperChatSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(
        500
      );
      expect(helperChatSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(
        100
      );

      const { resourceMetrics } = await getMetricReader().collect();
      const metrics = resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const inferenceCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
      );
      const toolCalls = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      const clientInputUsage = metrics.find(
        m =>
          m.descriptor.name ===
          METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS
      );

      expect(
        (inferenceCalls?.dataPoints[0]?.value as { sum?: number })?.sum
      ).toBe(2);
      expect((toolCalls?.dataPoints[0]?.value as { sum?: number })?.sum).toBe(
        1
      );
      // Both models are still accounted for in client inference usage metrics.
      let totalClientInputTokens = 0;
      for (const dp of clientInputUsage?.dataPoints ?? []) {
        if (typeof dp.value === 'number') {
          totalClientInputTokens += dp.value;
        }
      }
      expect(totalClientInputTokens).toBe(605);

      // Also verify built-in LLMTool sharing the exact same ChatModel instance as the agent.
      resetMemoryExporter();
      const sharedLlmTool = new LLMTool({ llm: agentLlm });
      const memory = new UnconstrainedMemory();
      await memory.add(new UserMessage('Acme Corp signed the contract.'));

      class LLMToolCallerAgent extends BaseAgent<
        { prompt: string },
        { result: AssistantMessage }
      > {
        public emitter = Emitter.root.child({
          namespace: ['agent', 'llmToolCaller'],
          creator: this,
        });
        public memory = memory;
        protected readonly input = { llm: agentLlm };

        override get meta() {
          return {
            name: 'EntityAgent',
            description: 'Calls LLMTool',
            tools: [],
          };
        }

        protected async _run(input: { prompt: string }) {
          const toolOut = await sharedLlmTool
            .run({ task: input.prompt })
            .context({ [Tool.contextKeys.Memory]: this.memory });
          const finalChat = await agentLlm.create({
            messages: [new UserMessage(toolOut.getTextContent())],
          });
          return { result: new AssistantMessage(finalChat.getTextContent()) };
        }

        override loadSnapshot() {}
      }

      const entityAgent = new LLMToolCallerAgent();
      await entityAgent.run({ prompt: 'Extract entities' });

      const secondSpans = getTestSpans();
      const entityAgentSpan = secondSpans.find(
        s => s.name === 'invoke_agent EntityAgent'
      );
      expect(entityAgentSpan).toBeDefined();
      // Only the agent's own finalChat call (50 in, 10 out) rolls onto EntityAgent,
      // not sharedLlmTool's internal call (300 in, 50 out).
      expect(entityAgentSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(
        50
      );
      expect(entityAgentSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(
        10
      );
    });

    it('tracks nested sub-agent usage and call counts independently inside an agent-as-tool', async () => {
      const subLlm = new MockChatModel({
        modelId: 'gpt-4o-mini',
        providerId: 'openai',
        responses: [
          () =>
            new ChatModelOutput(
              [new AssistantMessage('Final Answer: Paris is 18C.')],
              { promptTokens: 80, completionTokens: 25, totalTokens: 105 },
              'stop'
            ),
        ],
      });
      const subAgent = new ReActAgent({
        llm: subLlm,
        memory: new UnconstrainedMemory(),
        meta: { name: 'WeatherSpecialist', description: 'Weather sub-agent' },
        tools: [],
      });

      const delegateTool = new DynamicTool({
        name: 'ask_weather_specialist',
        description: 'Delegates weather queries to WeatherSpecialist',
        inputSchema: z.object({ question: z.string() }),
        handler: async input => {
          const subRes = await subAgent.run({ prompt: input.question });
          return new StringToolOutput(subRes.result.text);
        },
      });

      const rootLlm = new MockChatModel({
        modelId: 'claude-3-5-sonnet',
        providerId: 'anthropic',
        responses: [
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  [
                    'Thought: Ask specialist.',
                    'Function Name: ask_weather_specialist',
                    'Function Input: {"question":"Weather in Paris?"}',
                  ].join('\n')
                ),
              ],
              { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
              'stop'
            ),
          () =>
            new ChatModelOutput(
              [
                new AssistantMessage(
                  ['Thought: Got it.', 'Final Answer: Paris is 18C.'].join('\n')
                ),
              ],
              { promptTokens: 45, completionTokens: 10, totalTokens: 55 },
              'stop'
            ),
        ],
      });
      const rootAgent = new ReActAgent({
        llm: rootLlm,
        memory: new UnconstrainedMemory(),
        meta: { name: 'RootCoordinator', description: 'Root coordinator' },
        tools: [delegateTool],
      });

      const res = await rootAgent.run({ prompt: 'Weather in Paris?' });
      expect(res.result.text).toBe('Paris is 18C.');

      const spans = getTestSpans();
      const rootSpan = spans.find(
        s => s.name === 'invoke_agent RootCoordinator'
      );
      const subSpan = spans.find(
        s => s.name === 'invoke_agent WeatherSpecialist'
      );
      expect(rootSpan).toBeDefined();
      expect(subSpan).toBeDefined();
      expect(rootSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(75);
      expect(rootSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(25);
      expect(subSpan!.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(80);
      expect(subSpan!.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(25);
    });
  });
});
