/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import * as genaiUtil from '../src';
import {
  ATTR_GEN_AI_TOOL_CALL_ID,
  TelemetryHandler,
  type ChatMessage,
  type EmbeddingInvocation,
  type FinishReason,
  type GenAIInstrumentationConfig,
  type InferenceInvocation,
  type InferenceRequestOptions,
  type InputMessages,
  type LocalAgentInvocation,
  type LocalAgentRequestOptions,
  type MessagePart,
  type Modality,
  type OutputMessage,
  type OutputMessages,
  type SystemInstructions,
  type TokenUsageDetails,
  type ToolInvocation,
} from '../src';
import {
  createTestTelemetryContext,
  type TestTelemetryContext,
} from './helpers/test-setup';

describe('package index exports', () => {
  let ctx: TestTelemetryContext;

  beforeEach(() => {
    ctx = createTestTelemetryContext();
  });

  afterEach(async () => {
    await ctx.shutdown();
  });

  it('keeps invocation classes type-only and exports only expected runtime symbols', () => {
    assert.deepStrictEqual(Object.keys(genaiUtil).sort(), [
      'ATTR_GEN_AI_TOOL_CALL_ID',
      'TelemetryHandler',
    ]);
    assert.strictEqual(genaiUtil.TelemetryHandler, TelemetryHandler);
    assert.strictEqual(
      genaiUtil.ATTR_GEN_AI_TOOL_CALL_ID,
      ATTR_GEN_AI_TOOL_CALL_ID
    );
  });

  it('exposes invocation and telemetry data types for instrumentation consumers', () => {
    const config: GenAIInstrumentationConfig = {
      captureMessageContent: 'span_only',
    };
    const handler = new TelemetryHandler({
      instrumentationName: '@opentelemetry/instrumentation-test',
      instrumentationVersion: '1.0.0',
      tracerProvider: ctx.tracerProvider,
      meterProvider: ctx.meterProvider,
      config,
    });

    const modality: Modality = 'image';
    const part: MessagePart = {
      type: 'uri',
      modality,
      uri: 'https://example.com/image.png',
    };
    const chatMessage: ChatMessage = { role: 'user', parts: [part] };
    const inputMessages: InputMessages = [chatMessage];
    const systemInstructions: SystemInstructions = [
      { type: 'text', content: 'Be helpful.' },
    ];
    const outputMessage: OutputMessage = {
      role: 'assistant',
      parts: [{ type: 'text', content: 'Done.' }],
    };
    const outputMessages: OutputMessages = [outputMessage];
    const finishReason: FinishReason = 'stop';
    const usage: TokenUsageDetails = {
      inputTokenCount: 10,
      outputTokenCount: 5,
    };
    const inferenceOptions: InferenceRequestOptions = { temperature: 0.2 };
    const agentOptions: LocalAgentRequestOptions = { maxTokens: 256 };

    const agent: LocalAgentInvocation = handler.startLocalAgent({
      agentName: 'test-agent',
      requestOptions: agentOptions,
      inputMessages,
      systemInstructions,
    });
    const inference: InferenceInvocation = handler.startInference({
      providerName: 'openai',
      requestModel: 'gpt-4o',
      requestOptions: inferenceOptions,
      inputMessages,
      systemInstructions,
    });
    inference
      .setFinishReasons([finishReason])
      .setUsage(usage)
      .addOutputMessages(outputMessages)
      .stop();

    const embedding: EmbeddingInvocation = handler.startEmbedding({
      providerName: 'openai',
      requestModel: 'text-embedding-3-small',
    });
    embedding.stop();

    const tool: ToolInvocation = handler.startTool({ toolName: 'lookup' });
    tool.stop();

    agent.setUsage(usage).addOutputMessages(outputMessages).stop();

    assert.strictEqual(ctx.memoryExporter.getFinishedSpans().length, 4);
  });
});
