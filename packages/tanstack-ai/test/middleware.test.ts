/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  TracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace';
import {
  chat,
  type ChatMiddlewareConfig,
  type ChatMiddlewareContext,
  type DefaultMessageMetadataByModality,
  type StreamChunk,
  type TextAdapter,
} from '@tanstack/ai';
import { expect } from 'expect';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_ID,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
} from '@opentelemetry/genai-util';

import {
  openTelemetryMiddleware,
  createOpenTelemetryMiddleware,
} from '../dist/index.mjs';

function createTracerContext() {
  const memoryExporter = new InMemorySpanExporter();
  const tracerProvider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: memoryExporter })],
  });

  return {
    memoryExporter,
    tracerProvider,
    tracer: tracerProvider.getTracer('test-tracer'),
    getSpans: () => memoryExporter.getFinishedSpans(),
    reset: () => memoryExporter.reset(),
  };
}

function createContext(
  overrides: Partial<ChatMiddlewareContext> = {}
): ChatMiddlewareContext {
  return {
    requestId: 'req-1',
    streamId: 'stream-1',
    phase: 'init',
    iteration: 0,
    chunkIndex: 0,
    abort: () => {},
    context: undefined,
    defer: () => {},
    provider: 'openai',
    model: 'gpt-4o-mini',
    source: 'server',
    streaming: true,
    systemPrompts: [],
    toolNames: ['get_weather'],
    options: { temperature: 0.2 },
    modelOptions: {},
    messageCount: 1,
    hasTools: true,
    currentMessageId: null,
    accumulatedContent: '',
    messages: [{ role: 'user', content: 'What is the weather?' }],
    createId: (prefix: string) => `${prefix}-1`,
    ...overrides,
  };
}

function createConfig(
  messages: ChatMiddlewareConfig['messages'] = []
): ChatMiddlewareConfig {
  return {
    messages,
    systemPrompts: ['You are a helpful assistant.'],
    tools: [
      {
        name: 'get_weather',
        description: 'Get current weather',
        execute: async () => ({ temp: 72 }),
      },
    ],
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 100,
    metadata: {},
    modelOptions: {},
  };
}

function createFakeTextAdapter(
  chunks: StreamChunk[]
): TextAdapter<
  string,
  Record<string, never>,
  readonly ['text'],
  DefaultMessageMetadataByModality
> {
  return {
    kind: 'text',
    name: 'fake',
    model: 'fake-model',
    '~types': undefined as never,
    async *chatStream() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
    async structuredOutput() {
      return {
        data: { ok: true },
        rawText: '{"ok":true}',
      };
    },
  };
}

describe('OpenTelemetry TanStack AI Middleware', () => {
  let ctx: ReturnType<typeof createTracerContext>;

  beforeEach(() => {
    ctx = createTracerContext();
  });

  describe('Lifecycle and span generation', () => {
    it('creates root agent span onStart and finalizes onFinish', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);

      expect(ctx.getSpans().length).toBe(0);

      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 120,
        content: 'Done',
      });

      const spans = ctx.getSpans();
      expect(spans.length).toBe(1);
      const span = spans[0];
      expect(span.name).toBe('invoke_agent');
      expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      );
      expect(span.attributes[ATTR_GEN_AI_AGENT_NAME]).toBe('TanStackAI');
      expect(span.attributes[ATTR_GEN_AI_CONVERSATION_ID]).toBeUndefined();
      expect(span.attributes['tanstack.ai.request.id']).toBe('req-1');
      expect(span.attributes['tanstack.ai.stream.id']).toBe('stream-1');
      expect(span.attributes['tanstack.ai.finish_reason']).toBe('stop');
      expect(span.attributes['tanstack.ai.duration_ms']).toBe(120);
    });

    it('emits agent, model (chat), and tool execution spans with proper hierarchy', () => {
      const middleware = createOpenTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
        captureContent: true,
      });

      const reqCtx = createContext({ conversationId: 'conv-xyz' });
      middleware.onStart?.(reqCtx);

      const config = createConfig([
        { role: 'user', content: 'What is the weather in Tokyo?' },
      ]);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel', iteration: 0 },
        config
      );

      // Model streams tool call chunk
      middleware.onChunk?.(reqCtx, {
        type: 'TOOL_CALL_START',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        toolName: 'get_weather',
      });
      middleware.onChunk?.(reqCtx, {
        type: 'TOOL_CALL_ARGS',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        delta: '{"city":"Tokyo"}',
      });
      middleware.onChunk?.(reqCtx, {
        type: 'TOOL_CALL_END',
        timestamp: Date.now(),
        toolCallId: 'call-1',
        toolName: 'get_weather',
        input: { city: 'Tokyo' },
      });
      middleware.onChunk?.(reqCtx, {
        type: 'RUN_FINISHED',
        timestamp: Date.now(),
        runId: 'run-1',
        model: 'gpt-4o-mini',
        finishReason: 'tool_calls',
        usage: {
          promptTokens: 15,
          completionTokens: 8,
          totalTokens: 23,
        },
      });

      // Tool executes
      middleware.onBeforeToolCall?.(reqCtx, {
        toolCallId: 'call-1',
        toolName: 'get_weather',
        args: { city: 'Tokyo' },
        tool: { name: 'get_weather', description: 'Fetch weather' },
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
        },
      });
      middleware.onAfterToolCall?.(reqCtx, {
        toolCallId: 'call-1',
        toolName: 'get_weather',
        result: { temp: 72, condition: 'Sunny' },
        duration: 35,
        ok: true,
        tool: { name: 'get_weather', description: 'Fetch weather' },
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
        },
      });

      middleware.onFinish?.(reqCtx, {
        finishReason: 'tool_calls',
        duration: 250,
        content: '',
      });

      const spans = ctx.getSpans();
      expect(spans.length).toBe(3);

      const agentSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      )!;
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;
      const toolSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      )!;

      expect(agentSpan).toBeDefined();
      expect(modelSpan).toBeDefined();
      expect(toolSpan).toBeDefined();

      // Check parent-child relationships
      expect(
        modelSpan.parentSpanContext?.spanId ?? (modelSpan as any).parentSpanId
      ).toBe(agentSpan.spanContext().spanId);
      expect(
        toolSpan.parentSpanContext?.spanId ?? (toolSpan as any).parentSpanId
      ).toBe(agentSpan.spanContext().spanId);

      // Model span assertions
      expect(modelSpan.name).toBe('chat gpt-4o-mini');
      expect(modelSpan.attributes[ATTR_GEN_AI_PROVIDER_NAME]).toBe('openai');
      expect(modelSpan.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe(
        'gpt-4o-mini'
      );
      expect(modelSpan.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(15);
      expect(modelSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(8);
      expect(modelSpan.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]).toContain(
        'You are a helpful assistant.'
      );

      // Tool span assertions
      expect(toolSpan.name).toBe('execute_tool get_weather');
      expect(toolSpan.attributes[ATTR_GEN_AI_TOOL_NAME]).toBe('get_weather');
      expect(toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ID]).toBe('call-1');
      expect(toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS]).toContain(
        'Tokyo'
      );
      expect(toolSpan.attributes[ATTR_GEN_AI_TOOL_CALL_RESULT]).toContain(
        'Sunny'
      );
    });

    it('records stream chunk timing on streamed model turns', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
        captureContent: true,
      });

      const reqCtx = createContext({ streaming: true });
      middleware.onStart?.(reqCtx);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        createConfig([{ role: 'user', content: 'Stream test' }])
      );

      middleware.onChunk?.(reqCtx, {
        type: 'TEXT_MESSAGE_CONTENT',
        timestamp: Date.now(),
        messageId: 'msg-1',
        delta: 'Hello ',
        content: 'Hello ',
      });
      middleware.onChunk?.(reqCtx, {
        type: 'TEXT_MESSAGE_CONTENT',
        timestamp: Date.now(),
        messageId: 'msg-1',
        delta: 'World!',
        content: 'Hello World!',
      });
      middleware.onChunk?.(reqCtx, {
        type: 'RUN_FINISHED',
        timestamp: Date.now(),
        runId: 'run-1',
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 50,
        content: 'Hello World!',
      });

      const spans = ctx.getSpans();
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(modelSpan).toBeDefined();
      expect(modelSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toContain(
        'Hello World!'
      );
      expect(modelSpan.attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS]).toEqual(
        ['stop']
      );
    });
  });

  describe('Conversation ID handling', () => {
    it('records gen_ai.conversation.id when conversationId is provided in context', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext({ conversationId: 'conversation-42' });
      middleware.onStart?.(reqCtx);
      middleware.onBeforeToolCall?.(reqCtx, {
        toolCallId: 'call-conv',
        toolName: 'my_tool',
        args: {},
        tool: undefined,
        toolCall: {
          id: 'call-conv',
          type: 'function',
          function: { name: 'my_tool', arguments: '{}' },
        },
      });
      middleware.onAfterToolCall?.(reqCtx, {
        toolCallId: 'call-conv',
        toolName: 'my_tool',
        ok: true,
        duration: 5,
        tool: undefined,
        toolCall: {
          id: 'call-conv',
          type: 'function',
          function: { name: 'my_tool', arguments: '{}' },
        },
      });
      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 50,
        content: '',
      });

      const spans = ctx.getSpans();
      const agentSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      )!;
      const toolSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      )!;

      expect(agentSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID]).toBe(
        'conversation-42'
      );
      expect(toolSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID]).toBe(
        'conversation-42'
      );
    });

    it('omits gen_ai.conversation.id when conversationId is undefined', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext({ conversationId: undefined });
      middleware.onStart?.(reqCtx);
      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 10,
        content: '',
      });

      const spans = ctx.getSpans();
      const agentSpan = spans[0];
      expect(agentSpan.attributes[ATTR_GEN_AI_CONVERSATION_ID]).toBeUndefined();
    });
  });

  describe('Response model and response ID from RUN_FINISHED', () => {
    it('records gen_ai.response.model and gen_ai.response.id', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        createConfig([{ role: 'user', content: 'Hi' }])
      );
      middleware.onChunk?.(reqCtx, {
        type: 'RUN_FINISHED',
        timestamp: Date.now(),
        runId: 'run-abc-123',
        model: 'gpt-4o-2024-08-06',
        finishReason: 'stop',
      });
      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 20,
        content: '',
      });

      const spans = ctx.getSpans();
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(modelSpan.attributes[ATTR_GEN_AI_RESPONSE_MODEL]).toBe(
        'gpt-4o-2024-08-06'
      );
      expect(modelSpan.attributes[ATTR_GEN_AI_RESPONSE_ID]).toBe('run-abc-123');
    });
  });

  describe('TanStack AI 1.x compatibility', () => {
    it('supports object-based system prompts ({ content }) without [object Object]', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
        captureContent: true,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        {
          messages: [{ role: 'user', content: 'Test prompt' }],
          systemPrompts: [
            { content: 'You are a smart assistant.', metadata: {} } as any,
          ],
          tools: [],
        }
      );
      middleware.onChunk?.(reqCtx, {
        type: 'RUN_FINISHED',
        timestamp: Date.now(),
        runId: 'r-1',
        finishReason: 'stop',
      });
      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 10,
        content: '',
      });

      const spans = ctx.getSpans();
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(modelSpan.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]).toContain(
        'You are a smart assistant.'
      );
      expect(
        modelSpan.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]
      ).not.toContain('[object Object]');
    });

    it('supports array of SpecTokenUsage on RUN_FINISHED (1.0 inputTokens / outputTokens)', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        createConfig([{ role: 'user', content: 'Token count' }])
      );
      middleware.onChunk?.(reqCtx, {
        type: 'RUN_FINISHED',
        timestamp: Date.now(),
        runId: 'r-usage',
        finishReason: 'stop',
        usage: [{ inputTokens: 30, outputTokens: 12, totalTokens: 42 }],
      } as any);
      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 15,
        content: '',
      });

      const spans = ctx.getSpans();
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(modelSpan.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(30);
      expect(modelSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(12);
    });

    it('captures legacy token usage format (promptTokens / completionTokens)', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        createConfig([{ role: 'user', content: 'Legacy tokens' }])
      );
      middleware.onChunk?.(reqCtx, {
        type: 'RUN_FINISHED',
        timestamp: Date.now(),
        runId: 'r-usage-legacy',
        finishReason: 'stop',
        usage: [{ promptTokens: 25, completionTokens: 15, totalTokens: 40 }],
      } as any);
      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 15,
        content: '',
      });

      const spans = ctx.getSpans();
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(modelSpan.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(25);
      expect(modelSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(15);
    });
  });

  describe('wrapFetch context propagation', () => {
    it('returns wrapFetch from onConfig that executes fetch inside invocation active context', async () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);

      const configResult = (await middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        createConfig([{ role: 'user', content: 'Wrap fetch test' }])
      )) as any;

      expect(configResult).toBeDefined();
      expect(typeof configResult.wrapFetch).toBe('function');

      let capturedActiveSpanId: string | undefined;
      const fakeFetch = async () => {
        capturedActiveSpanId = trace
          .getSpan(context.active())
          ?.spanContext().spanId;
        return new Response('ok');
      };

      const wrapped = configResult.wrapFetch(fakeFetch);
      await wrapped('https://api.openai.com/v1/chat/completions');

      middleware.onChunk?.(reqCtx, {
        type: 'RUN_FINISHED',
        timestamp: Date.now(),
        runId: 'r-fetch',
        finishReason: 'stop',
      });
      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 20,
        content: '',
      });

      const spans = ctx.getSpans();
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(capturedActiveSpanId).toBe(modelSpan.spanContext().spanId);
    });
  });

  describe('Tool execution context propagation', () => {
    it('wraps tool.execute so internal spans nest under execute_tool', async () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);

      let capturedActiveSpanId: string | undefined;
      const fakeTool = {
        name: 'test_tool',
        description: 'A tool for testing context',
        execute: async (_args: any) => {
          capturedActiveSpanId = trace
            .getSpan(context.active())
            ?.spanContext().spanId;
          const childSpan = ctx.tracer.startSpan('inner_tool_span');
          childSpan.end();
          return { done: true };
        },
      };

      middleware.onBeforeToolCall?.(reqCtx, {
        toolCallId: 'call-tool-ctx',
        toolName: 'test_tool',
        args: { foo: 'bar' },
        tool: fakeTool as any,
        toolCall: {
          id: 'call-tool-ctx',
          type: 'function',
          function: { name: 'test_tool', arguments: '{"foo":"bar"}' },
        },
      });

      const result = await fakeTool.execute({ foo: 'bar' });
      expect(result).toEqual({ done: true });

      middleware.onAfterToolCall?.(reqCtx, {
        toolCallId: 'call-tool-ctx',
        toolName: 'test_tool',
        tool: fakeTool as any,
        toolCall: {
          id: 'call-tool-ctx',
          type: 'function',
          function: { name: 'test_tool', arguments: '{"foo":"bar"}' },
        },
        ok: true,
        duration: 10,
        result,
      });

      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 20,
        content: 'done',
      });

      const spans = ctx.getSpans();
      const toolSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      )!;
      const innerSpan = spans.find(s => s.name === 'inner_tool_span')!;

      expect(toolSpan).toBeDefined();
      expect(innerSpan).toBeDefined();
      expect(capturedActiveSpanId).toBe(toolSpan.spanContext().spanId);
      expect(
        innerSpan.parentSpanContext?.spanId ?? (innerSpan as any).parentSpanId
      ).toBe(toolSpan.spanContext().spanId);
    });

    it('handles parallel calls to the same tool without stacking wrappers', async () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);

      const capturedSpanIds = new Map<string, string | undefined>();
      const sharedTool = {
        name: 'shared_weather',
        description: 'Weather tool called in parallel',
        execute: async (args: any, _execContext?: any) => {
          const activeSpanId = trace
            .getSpan(context.active())
            ?.spanContext().spanId;
          capturedSpanIds.set(args.city, activeSpanId);
          return { temp: 70, city: args.city };
        },
      };

      // TanStack AI 1.0 prepares parallel calls first:
      middleware.onBeforeToolCall?.(reqCtx, {
        toolCallId: 'call-p1',
        toolName: 'shared_weather',
        args: { city: 'Paris' },
        tool: sharedTool as any,
        toolCall: {
          id: 'call-p1',
          type: 'function',
          function: { name: 'shared_weather', arguments: '{"city":"Paris"}' },
        },
      });

      middleware.onBeforeToolCall?.(reqCtx, {
        toolCallId: 'call-p2',
        toolName: 'shared_weather',
        args: { city: 'London' },
        tool: sharedTool as any,
        toolCall: {
          id: 'call-p2',
          type: 'function',
          function: { name: 'shared_weather', arguments: '{"city":"London"}' },
        },
      });

      // Both execute concurrently, receiving their respective ToolExecutionContext:
      const [res1, res2] = await Promise.all([
        sharedTool.execute({ city: 'Paris' }, { toolCallId: 'call-p1' }),
        sharedTool.execute({ city: 'London' }, { toolCallId: 'call-p2' }),
      ]);

      expect(res1).toEqual({ temp: 70, city: 'Paris' });
      expect(res2).toEqual({ temp: 70, city: 'London' });

      middleware.onAfterToolCall?.(reqCtx, {
        toolCallId: 'call-p1',
        toolName: 'shared_weather',
        tool: sharedTool as any,
        toolCall: {
          id: 'call-p1',
          type: 'function',
          function: { name: 'shared_weather', arguments: '{"city":"Paris"}' },
        },
        ok: true,
        duration: 10,
        result: res1,
      });

      middleware.onAfterToolCall?.(reqCtx, {
        toolCallId: 'call-p2',
        toolName: 'shared_weather',
        tool: sharedTool as any,
        toolCall: {
          id: 'call-p2',
          type: 'function',
          function: { name: 'shared_weather', arguments: '{"city":"London"}' },
        },
        ok: true,
        duration: 12,
        result: res2,
      });

      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 30,
        content: 'done',
      });

      const spans = ctx.getSpans();
      const toolSpans = spans.filter(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      );
      expect(toolSpans.length).toBe(2);

      const spanP1 = toolSpans.find(
        s => s.attributes[ATTR_GEN_AI_TOOL_CALL_ID] === 'call-p1'
      )!;
      const spanP2 = toolSpans.find(
        s => s.attributes[ATTR_GEN_AI_TOOL_CALL_ID] === 'call-p2'
      )!;

      expect(spanP1).toBeDefined();
      expect(spanP2).toBeDefined();
      expect(spanP1.spanContext().spanId).not.toBe(spanP2.spanContext().spanId);

      // Verify that each parallel call body ran inside its OWN execute_tool span context:
      expect(capturedSpanIds.get('Paris')).toBe(spanP1.spanContext().spanId);
      expect(capturedSpanIds.get('London')).toBe(spanP2.spanContext().spanId);
    });

    it('cleans up wrapper and pending queue when a tool call is skipped by downstream middleware', async () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);

      const originalFn = async (args: any) => ({ handled: args });
      const toolToSkip = {
        name: 'skip_me',
        description: 'Tool that will be skipped',
        execute: originalFn,
      };

      middleware.onBeforeToolCall?.(reqCtx, {
        toolCallId: 'call-skip',
        toolName: 'skip_me',
        args: { query: 'test' },
        tool: toolToSkip as any,
        toolCall: {
          id: 'call-skip',
          type: 'function',
          function: { name: 'skip_me', arguments: '{"query":"test"}' },
        },
      });

      // A downstream middleware skips execution, so toolToSkip.execute is NEVER called!
      // TanStack AI directly fires onAfterToolCall:
      middleware.onAfterToolCall?.(reqCtx, {
        toolCallId: 'call-skip',
        toolName: 'skip_me',
        tool: toolToSkip as any,
        toolCall: {
          id: 'call-skip',
          type: 'function',
          function: { name: 'skip_me', arguments: '{"query":"test"}' },
        },
        ok: true,
        duration: 0,
        result: { cached: true },
      });

      // Wrapper should be cleaned up immediately, restoring original execute
      expect(toolToSkip.execute).toBe(originalFn);

      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 15,
        content: '',
      });
    });

    it('coordinates wrapper across separate middleware instances sharing the same tool', async () => {
      const middlewareA = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });
      const middlewareB = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqA = createContext({ requestId: 'req-a' });
      const reqB = createContext({ requestId: 'req-b' });

      middlewareA.onStart?.(reqA);
      middlewareB.onStart?.(reqB);

      let capturedSpanB: string | undefined;
      const originalFn = async (_args: any) => {
        capturedSpanB = trace.getSpan(context.active())?.spanContext().spanId;
        return { ok: true };
      };
      const sharedTool = {
        name: 'shared_across_instances',
        description: 'Tool shared by multiple chats',
        execute: originalFn,
      };

      // Both requests encounter the same tool
      middlewareA.onBeforeToolCall?.(reqA, {
        toolCallId: 'call-a',
        toolName: 'shared_across_instances',
        args: {},
        tool: sharedTool as any,
        toolCall: {
          id: 'call-a',
          type: 'function',
          function: { name: 'shared_across_instances', arguments: '{}' },
        },
      });

      middlewareB.onBeforeToolCall?.(reqB, {
        toolCallId: 'call-b',
        toolName: 'shared_across_instances',
        args: {},
        tool: sharedTool as any,
        toolCall: {
          id: 'call-b',
          type: 'function',
          function: { name: 'shared_across_instances', arguments: '{}' },
        },
      });

      // Request A finishes first (e.g. tool execution was skipped or finished fast)
      middlewareA.onAfterToolCall?.(reqA, {
        toolCallId: 'call-a',
        toolName: 'shared_across_instances',
        tool: sharedTool as any,
        toolCall: {
          id: 'call-a',
          type: 'function',
          function: { name: 'shared_across_instances', arguments: '{}' },
        },
        ok: true,
        duration: 5,
        result: { doneA: true },
      });
      middlewareA.onFinish?.(reqA, {
        finishReason: 'stop',
        duration: 10,
        content: '',
      });

      // Tool should still be wrapped for Request B!
      expect(sharedTool.execute).not.toBe(originalFn);

      // Now Request B's tool body executes:
      await sharedTool.execute({}, { toolCallId: 'call-b' });

      // Request B completes
      middlewareB.onAfterToolCall?.(reqB, {
        toolCallId: 'call-b',
        toolName: 'shared_across_instances',
        tool: sharedTool as any,
        toolCall: {
          id: 'call-b',
          type: 'function',
          function: { name: 'shared_across_instances', arguments: '{}' },
        },
        ok: true,
        duration: 12,
        result: { doneB: true },
      });
      middlewareB.onFinish?.(reqB, {
        finishReason: 'stop',
        duration: 20,
        content: '',
      });

      const spans = ctx.getSpans();
      const spanB = spans.find(
        s => s.attributes[ATTR_GEN_AI_TOOL_CALL_ID] === 'call-b'
      )!;
      expect(spanB).toBeDefined();
      expect(capturedSpanB).toBe(spanB.spanContext().spanId);

      // Now that all requests are finished, original execute is restored:
      expect(sharedTool.execute).toBe(originalFn);
    });

    it('cleans up tool wrapper on terminal error without onAfterToolCall', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext({ requestId: 'req-err' });
      middleware.onStart?.(reqCtx);

      const originalFn = async (_args: any) => ({ ok: true });
      const errTool = {
        name: 'err_tool',
        description: 'Tool before error',
        execute: originalFn,
      };

      middleware.onBeforeToolCall?.(reqCtx, {
        toolCallId: 'call-err-term',
        toolName: 'err_tool',
        args: {},
        tool: errTool as any,
        toolCall: {
          id: 'call-err-term',
          type: 'function',
          function: { name: 'err_tool', arguments: '{}' },
        },
      });

      // Error occurs before onAfterToolCall:
      middleware.onError?.(reqCtx, {
        error: new Error('Simulated failure during turn'),
        duration: 10,
      });

      // Terminal cleanup must restore original execute and clear pending queue:
      expect(errTool.execute).toBe(originalFn);
    });
  });

  describe('Early iteration stop', () => {
    it('handles consumer stopping early without running all iterations', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        createConfig([{ role: 'user', content: 'Early stop' }])
      );

      // Consumer stops early: onFinish called before RUN_FINISHED chunk
      middleware.onFinish?.(reqCtx, {
        finishReason: 'cancelled',
        duration: 20,
        content: '',
      });

      const spans = ctx.getSpans();
      expect(spans.length).toBe(2);
      const agentSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      )!;
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(agentSpan).toBeDefined();
      expect(modelSpan).toBeDefined();
    });
  });

  describe('Error and abort handling', () => {
    it('marks model span as error on RUN_ERROR', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        createConfig([{ role: 'user', content: 'Err' }])
      );

      middleware.onChunk?.(reqCtx, {
        type: 'RUN_ERROR',
        timestamp: Date.now(),
        error: { message: 'Rate limit exceeded' },
      });
      middleware.onFinish?.(reqCtx, {
        finishReason: 'error',
        duration: 10,
        content: '',
      });

      const spans = ctx.getSpans();
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(modelSpan.status.code).toBe(SpanStatusCode.ERROR);
      expect(modelSpan.status.message).toBe('Rate limit exceeded');
    });

    it('marks tool span as error when tool execution fails', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);
      middleware.onBeforeToolCall?.(reqCtx, {
        toolCallId: 'call-fail',
        toolName: 'broken_tool',
        args: { id: 1 },
        tool: undefined,
        toolCall: {
          id: 'call-fail',
          type: 'function',
          function: { name: 'broken_tool', arguments: '{"id":1}' },
        },
      });
      middleware.onAfterToolCall?.(reqCtx, {
        toolCallId: 'call-fail',
        toolName: 'broken_tool',
        duration: 12,
        ok: false,
        error: new Error('Network timeout in tool'),
        tool: undefined,
        toolCall: {
          id: 'call-fail',
          type: 'function',
          function: { name: 'broken_tool', arguments: '{"id":1}' },
        },
      });
      middleware.onFinish?.(reqCtx, {
        finishReason: 'error',
        duration: 20,
        content: '',
      });

      const spans = ctx.getSpans();
      const toolSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      )!;

      expect(toolSpan.status.code).toBe(SpanStatusCode.ERROR);
      expect(toolSpan.status.message).toContain('Network timeout in tool');
    });

    it('handles request abort and ends active spans with error', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        createConfig([{ role: 'user', content: 'Abort test' }])
      );
      middleware.onBeforeToolCall?.(reqCtx, {
        toolCallId: 'call-aborted',
        toolName: 'slow_tool',
        args: {},
        tool: undefined,
        toolCall: {
          id: 'call-aborted',
          type: 'function',
          function: { name: 'slow_tool', arguments: '{}' },
        },
      });

      middleware.onAbort?.(reqCtx, {
        reason: 'User cancelled request',
        duration: 40,
      });

      const spans = ctx.getSpans();
      expect(spans.length).toBe(3);

      const agentSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      )!;
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;
      const toolSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL
      )!;

      expect(agentSpan.status.code).toBe(SpanStatusCode.ERROR);
      expect(agentSpan.status.message).toBe('User cancelled request');
      expect(modelSpan.status.code).toBe(SpanStatusCode.ERROR);
      expect(toolSpan.status.code).toBe(SpanStatusCode.ERROR);
    });

    it('handles request error and records exception', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);

      middleware.onError?.(reqCtx, {
        error: new Error('Critical runtime failure'),
        duration: 30,
      });

      const spans = ctx.getSpans();
      expect(spans.length).toBe(1);
      const agentSpan = spans[0];
      expect(agentSpan.status.code).toBe(SpanStatusCode.ERROR);
      expect(agentSpan.status.message).toBe('Critical runtime failure');
    });
  });

  describe('Content capture & suppression', () => {
    it('omits message content by default when neither option nor env var is set', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        createConfig([{ role: 'user', content: 'Secret prompt' }])
      );
      middleware.onChunk?.(reqCtx, {
        type: 'TEXT_MESSAGE_CONTENT',
        timestamp: Date.now(),
        messageId: 'msg-1',
        delta: 'Secret reply',
        content: 'Secret reply',
      });
      middleware.onChunk?.(reqCtx, {
        type: 'RUN_FINISHED',
        timestamp: Date.now(),
        runId: 'run-1',
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 50,
        content: 'Secret reply',
      });

      const spans = ctx.getSpans();
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(modelSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES]).toBeUndefined();
      expect(modelSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
      expect(
        modelSpan.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]
      ).toBeUndefined();
    });

    it('omits message content when captureContent is explicitly false', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
        captureContent: false,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        createConfig([{ role: 'user', content: 'Secret prompt' }])
      );
      middleware.onChunk?.(reqCtx, {
        type: 'TEXT_MESSAGE_CONTENT',
        timestamp: Date.now(),
        messageId: 'msg-1',
        delta: 'Secret reply',
        content: 'Secret reply',
      });
      middleware.onChunk?.(reqCtx, {
        type: 'RUN_FINISHED',
        timestamp: Date.now(),
        runId: 'run-1',
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 50,
        content: 'Secret reply',
      });

      const spans = ctx.getSpans();
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(modelSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES]).toBeUndefined();
      expect(modelSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
      expect(
        modelSpan.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]
      ).toBeUndefined();
    });

    it('captures message content when captureContent is explicitly true', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
        captureContent: true,
      });

      const reqCtx = createContext();
      middleware.onStart?.(reqCtx);
      middleware.onConfig?.(
        { ...reqCtx, phase: 'beforeModel' },
        createConfig([{ role: 'user', content: 'Captured prompt' }])
      );
      middleware.onChunk?.(reqCtx, {
        type: 'TEXT_MESSAGE_CONTENT',
        timestamp: Date.now(),
        messageId: 'msg-1',
        delta: 'Captured reply',
        content: 'Captured reply',
      });
      middleware.onChunk?.(reqCtx, {
        type: 'RUN_FINISHED',
        timestamp: Date.now(),
        runId: 'run-1',
        model: 'gpt-4o-mini',
        finishReason: 'stop',
      });
      middleware.onFinish?.(reqCtx, {
        finishReason: 'stop',
        duration: 50,
        content: 'Captured reply',
      });

      const spans = ctx.getSpans();
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(modelSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES]).toBeDefined();
      expect(modelSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toBeDefined();
      expect(
        modelSpan.attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS]
      ).toBeDefined();
    });

    it('captures message content when OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT is span', () => {
      const previousEnv =
        process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'span';

      try {
        const middleware = openTelemetryMiddleware({
          tracer: ctx.tracer,
          tracerProvider: ctx.tracerProvider,
        });

        const reqCtx = createContext();
        middleware.onStart?.(reqCtx);
        middleware.onConfig?.(
          { ...reqCtx, phase: 'beforeModel' },
          createConfig([{ role: 'user', content: 'Env captured prompt' }])
        );
        middleware.onChunk?.(reqCtx, {
          type: 'TEXT_MESSAGE_CONTENT',
          timestamp: Date.now(),
          messageId: 'msg-1',
          delta: 'Env captured reply',
          content: 'Env captured reply',
        });
        middleware.onChunk?.(reqCtx, {
          type: 'RUN_FINISHED',
          timestamp: Date.now(),
          runId: 'run-env',
          model: 'gpt-4o-mini',
          finishReason: 'stop',
        });
        middleware.onFinish?.(reqCtx, {
          finishReason: 'stop',
          duration: 50,
          content: 'Env captured reply',
        });

        const spans = ctx.getSpans();
        const modelSpan = spans.find(
          s =>
            s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
            GEN_AI_OPERATION_NAME_VALUE_CHAT
        )!;

        expect(modelSpan.attributes[ATTR_GEN_AI_INPUT_MESSAGES]).toBeDefined();
        expect(modelSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toBeDefined();
      } finally {
        if (previousEnv === undefined) {
          delete process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
        } else {
          process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT =
            previousEnv;
        }
      }
    });

    it('respects suppressed tracing context', () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
      });

      const reqCtx = createContext();

      context.with(suppressTracing(context.active()), () => {
        middleware.onStart?.(reqCtx);
        middleware.onConfig?.(
          { ...reqCtx, phase: 'beforeModel' },
          createConfig([{ role: 'user', content: 'Suppressed' }])
        );
        middleware.onBeforeToolCall?.(reqCtx, {
          toolCallId: 'suppressed-call',
          toolName: 'my_tool',
          args: {},
          tool: undefined,
          toolCall: {
            id: 'suppressed-call',
            type: 'function',
            function: { name: 'my_tool', arguments: '{}' },
          },
        });
      });

      expect(ctx.getSpans().length).toBe(0);
    });
  });

  describe('Integration with real chat() and fake adapter', () => {
    it('instruments a streaming chat() run with a fake adapter', async () => {
      const middleware = openTelemetryMiddleware({
        tracer: ctx.tracer,
        tracerProvider: ctx.tracerProvider,
        captureContent: true,
      });

      const adapter = createFakeTextAdapter([
        {
          type: 'TEXT_MESSAGE_CONTENT',
          timestamp: Date.now(),
          messageId: 'msg-1',
          delta: 'OpenTelemetry traces AI applications.',
          content: 'OpenTelemetry traces AI applications.',
        },
        {
          type: 'RUN_FINISHED',
          timestamp: Date.now(),
          runId: 'run-fake',
          model: 'fake-model',
          finishReason: 'stop',
          usage: {
            promptTokens: 4,
            completionTokens: 6,
            totalTokens: 10,
          },
        },
      ]);

      const stream = await (chat as any)({
        adapter,
        model: 'fake-model',
        messages: [{ role: 'user', content: 'What is OTel?' }],
        middleware: [middleware],
      });

      expect(stream).toBeDefined();

      let fullText = '';
      for await (const chunk of stream) {
        if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
          fullText += chunk.delta ?? '';
        }
      }

      expect(fullText).toBe('OpenTelemetry traces AI applications.');

      const spans = ctx.getSpans();
      expect(spans.length).toBe(2);

      const agentSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT
      )!;
      const modelSpan = spans.find(
        s =>
          s.attributes[ATTR_GEN_AI_OPERATION_NAME] ===
          GEN_AI_OPERATION_NAME_VALUE_CHAT
      )!;

      expect(agentSpan).toBeDefined();
      expect(modelSpan).toBeDefined();
      expect(
        modelSpan.parentSpanContext?.spanId ?? (modelSpan as any).parentSpanId
      ).toBe(agentSpan.spanContext().spanId);
      expect(modelSpan.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(4);
      expect(modelSpan.attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(6);
      expect(modelSpan.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toContain(
        'OpenTelemetry traces AI applications.'
      );
    });
  });
});
