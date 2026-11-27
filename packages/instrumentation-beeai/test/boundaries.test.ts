/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context, trace } from '@opentelemetry/api';
import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import { GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT } from '@opentelemetry/genai-util';
import { expect } from 'expect';
import * as sinon from 'sinon';

import { BaseAgent } from 'beeai-framework/agents/base';
import { RemoteAgent } from 'beeai-framework/agents/experimental/remote/agent';
import { LangChainChatModel } from 'beeai-framework/adapters/langchain/backend/chat';
import { LangChainEmbeddingModel } from 'beeai-framework/adapters/langchain/backend/embedding';
import { LangChainTool } from 'beeai-framework/adapters/langchain/tools';
import { AssistantMessage, UserMessage } from 'beeai-framework/backend/message';
import { Emitter } from 'beeai-framework/emitter/emitter';
import { UnconstrainedMemory } from 'beeai-framework/memory/unconstrainedMemory';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS,
  METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS,
  setupBeeAITestSuite,
} from './helpers';

describe('BeeAIInstrumentation - Adapter and boundary ownership', () => {
  const { getMetricReader } = setupBeeAITestSuite();

  describe('LangChain adapter boundary ownership', () => {
    it('skips duplicate BeeAI spans and metrics on LangChainTool, LangChainChatModel, and LangChainEmbeddingModel while propagating parent context', async () => {
      const tracer = trace.getTracer('test-app');
      const parentSpan = tracer.startSpan('app-request');
      const parentCtx = trace.setSpan(context.active(), parentSpan);

      let seenToolSpanId: string | undefined;
      let seenChatSpanId: string | undefined;
      let seenEmbSpanId: string | undefined;

      const mockLcTool = {
        name: 'lc_search',
        description: 'LangChain delegated search tool',
        schema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false,
        },
        metadata: {},
        invoke: async (arg: { query: string }) => {
          seenToolSpanId = trace
            .getSpan(context.active())
            ?.spanContext().spanId;
          return { hit: arg.query };
        },
      };
      const beeLcTool = new LangChainTool({
        tool: mockLcTool as unknown as ConstructorParameters<
          typeof LangChainTool
        >[0]['tool'],
      });

      const mockLcChat = {
        model: 'gpt-4o-mini',
        _modelType: () => 'base_chat_model',
        invoke: async () => {
          seenChatSpanId = trace
            .getSpan(context.active())
            ?.spanContext().spanId;
          return {
            content: 'Delegated chat reply',
            usage_metadata: {
              input_tokens: 11,
              output_tokens: 7,
              total_tokens: 18,
            },
            response_metadata: { stop_sequence: 'stop' },
          };
        },
      };
      const beeLcChat = new LangChainChatModel(
        mockLcChat as unknown as ConstructorParameters<
          typeof LangChainChatModel
        >[0]
      );

      const mockLcEmbedding = {
        embedDocuments: async (values: string[]) => {
          seenEmbSpanId = trace.getSpan(context.active())?.spanContext().spanId;
          return values.map(() => [0.25, 0.5, 0.75]);
        },
      };
      const beeLcEmbedding = new LangChainEmbeddingModel(
        mockLcEmbedding as unknown as ConstructorParameters<
          typeof LangChainEmbeddingModel
        >[0]
      );

      // Build lazy Runs inside parentCtx and await them outside parentCtx to verify
      // passthrough parent context propagation into delegated calls.
      const [toolRun, chatRun, embRun] = context.with(
        parentCtx,
        () =>
          [
            beeLcTool.run({ query: 'otel' }),
            beeLcChat.create({ messages: [new UserMessage('Hello')] }),
            beeLcEmbedding.create({ values: ['embed-me'] }),
          ] as const
      );

      const toolOut = await toolRun;
      const chatOut = await chatRun;
      const embOut = await embRun;
      parentSpan.end();

      expect(toolOut.result).toEqual({ hit: 'otel' });
      expect(chatOut.getTextContent()).toBe('Delegated chat reply');
      expect(embOut.embeddings).toEqual([[0.25, 0.5, 0.75]]);

      const expectedParentId = parentSpan.spanContext().spanId;
      expect(seenToolSpanId).toBe(expectedParentId);
      expect(seenChatSpanId).toBe(expectedParentId);
      expect(seenEmbSpanId).toBe(expectedParentId);

      // Only the caller's `app-request` span should be emitted — zero BeeAI spans!
      const beeSpans = getTestSpans().filter(
        s =>
          s.instrumentationScope.name === '@opentelemetry/instrumentation-beeai'
      );
      expect(beeSpans).toHaveLength(0);

      const collected = await getMetricReader().collect();
      expect(collected.resourceMetrics.scopeMetrics).toHaveLength(0);
    });

    it('attributes call counts and parent context to an enclosing BeeAI agent without emitting duplicate child spans', async () => {
      let delegatedChatParentId: string | undefined;
      let delegatedToolParentId: string | undefined;

      const mockLcChat = {
        model: 'gpt-4o-mini',
        _modelType: () => 'base_chat_model',
        invoke: async () => {
          delegatedChatParentId = trace
            .getSpan(context.active())
            ?.spanContext().spanId;
          return {
            content: 'Agent reply via LangChain LLM',
            usage_metadata: {
              input_tokens: 9,
              output_tokens: 4,
              total_tokens: 13,
            },
            response_metadata: { stop_sequence: 'stop' },
          };
        },
      };
      const beeLcChat = new LangChainChatModel(
        mockLcChat as unknown as ConstructorParameters<
          typeof LangChainChatModel
        >[0]
      );

      const mockLcTool = {
        name: 'lc_calc',
        description: 'LangChain calculator',
        schema: {
          type: 'object',
          properties: { x: { type: 'number' } },
          required: ['x'],
          additionalProperties: false,
        },
        metadata: {},
        invoke: async (arg: { x: number }) => {
          delegatedToolParentId = trace
            .getSpan(context.active())
            ?.spanContext().spanId;
          return { doubled: arg.x * 2 };
        },
      };
      const beeLcTool = new LangChainTool({
        tool: mockLcTool as unknown as ConstructorParameters<
          typeof LangChainTool
        >[0]['tool'],
      });

      class DelegatingAgent extends BaseAgent<
        { prompt: string | null },
        { result: AssistantMessage }
      > {
        public emitter = Emitter.root.child({
          namespace: ['agent', 'delegating'],
          creator: this,
        });
        public memory = new UnconstrainedMemory();
        protected readonly input = { llm: beeLcChat };

        override get meta() {
          return {
            name: 'DelegatingAssistant',
            description: 'Uses LangChain adapters',
            tools: [],
          };
        }

        protected async _run(input: { prompt: string | null }) {
          await beeLcTool.run({ x: 21 });
          const chatRes = await beeLcChat.create({
            messages: [new UserMessage(input.prompt ?? 'hi')],
          });
          const answer = new AssistantMessage(chatRes.getTextContent());
          return { result: answer };
        }

        override createSnapshot() {
          return {
            ...super.createSnapshot(),
            emitter: this.emitter,
            memory: this.memory,
          };
        }

        override loadSnapshot() {}
      }

      const agent = new DelegatingAgent();
      const out = await agent.run({ prompt: 'compute' });
      expect(out.result.text).toBe('Agent reply via LangChain LLM');

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const agentSpan = spans[0];
      expect(agentSpan.name).toBe('invoke_agent DelegatingAssistant');
      expect(agentSpan.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      );
      // Extracts `lcLLM.model` ('gpt-4o-mini') rather than LangChain's internal 'base_chat_model' tag.
      expect(agentSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe(
        'gpt-4o-mini'
      );

      // Both delegated calls received the enclosing BeeAI agent span as active context.
      expect(delegatedChatParentId).toBe(agentSpan.spanContext().spanId);
      expect(delegatedToolParentId).toBe(agentSpan.spanContext().spanId);

      // Enclosing agent call-count metrics still recorded 1 inference call and 1 tool call.
      const collected = await getMetricReader().collect();
      const metrics = collected.resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      const inferenceCallsMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS
      );
      const toolCallsMetric = metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS
      );
      expect(
        (inferenceCallsMetric?.dataPoints[0]?.value as { sum?: number })?.sum
      ).toBe(1);
      expect(
        (toolCallsMetric?.dataPoints[0]?.value as { sum?: number })?.sum
      ).toBe(1);
    });
  });

  describe('Experimental RemoteAgent opt-out', () => {
    it('skips local INTERNAL agent spans and metrics on RemoteAgent while preserving caller context', async () => {
      const remoteAgent = new RemoteAgent({
        agentName: 'weather-acp-agent',
        url: 'http://127.0.0.1:8080',
        memory: new UnconstrainedMemory(),
      });

      const remoteInternal = remoteAgent as unknown as {
        client: { stream: (...args: unknown[]) => AsyncGenerator<unknown> };
        isRunning: boolean;
      };
      let observedParentSpanId: string | undefined;
      sinon.stub(remoteInternal.client, 'stream').callsFake(async function* () {
        observedParentSpanId = trace.getActiveSpan()?.spanContext().spanId;
        yield {
          event: 'message',
          id: '1',
          data: JSON.stringify({
            type: 'run.completed',
            run: {
              output: [{ parts: [{ content: 'Sunny, 72F' }] }],
            },
          }),
        };
      });

      const appTracer = trace.getTracer('app-test');
      let callerSpanId: string | undefined;
      const out = await appTracer.startActiveSpan('caller-op', async span => {
        callerSpanId = span.spanContext().spanId;
        try {
          return await remoteAgent.run({ input: 'Weather in SF?' });
        } finally {
          span.end();
        }
      });

      expect(out.result.text).toBe('Sunny, 72F');
      expect(observedParentSpanId).toBe(callerSpanId);

      // Only the caller span should be emitted — no bogus INTERNAL invoke_agent span.
      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe('caller-op');

      // Also verify synchronous BaseAgent error path (`isRunning = true`) is skipped.
      remoteInternal.isRunning = true;
      expect(() => remoteAgent.run({ input: 'concurrent' })).toThrow(
        /already running/i
      );
      expect(getTestSpans()).toHaveLength(1);

      const collected = await getMetricReader().collect();
      const metrics = collected.resourceMetrics.scopeMetrics[0]?.metrics ?? [];
      expect(metrics).toHaveLength(0);
    });
  });
});
