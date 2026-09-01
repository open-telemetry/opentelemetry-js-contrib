/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_AGENT_VERSION,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
  EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
  EVENT_GEN_AI_CLIENT_OPERATION_EXCEPTION,
} from '../src/semconv';

describe('GenAI Semantic Conventions', () => {
  it('should define expected attribute names', () => {
    assert.strictEqual(ATTR_GEN_AI_OPERATION_NAME, 'gen_ai.operation.name');
    assert.strictEqual(ATTR_GEN_AI_PROVIDER_NAME, 'gen_ai.provider.name');
    assert.strictEqual(ATTR_GEN_AI_REQUEST_MODEL, 'gen_ai.request.model');
    assert.strictEqual(ATTR_GEN_AI_RESPONSE_MODEL, 'gen_ai.response.model');
    assert.strictEqual(
      ATTR_GEN_AI_USAGE_INPUT_TOKENS,
      'gen_ai.usage.input_tokens'
    );
    assert.strictEqual(
      ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
      'gen_ai.usage.output_tokens'
    );
    assert.strictEqual(
      ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
      'gen_ai.usage.reasoning.output_tokens'
    );
    assert.strictEqual(
      ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
      'gen_ai.usage.cache_read.input_tokens'
    );
    assert.strictEqual(
      ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
      'gen_ai.usage.cache_write.input_tokens'
    );
    assert.strictEqual(ATTR_GEN_AI_INPUT_MESSAGES, 'gen_ai.input.messages');
    assert.strictEqual(ATTR_GEN_AI_OUTPUT_MESSAGES, 'gen_ai.output.messages');
    assert.strictEqual(ATTR_GEN_AI_TOOL_TYPE, 'gen_ai.tool.type');
    assert.strictEqual(ATTR_GEN_AI_AGENT_VERSION, 'gen_ai.agent.version');
    assert.strictEqual(ATTR_GEN_AI_WORKFLOW_NAME, 'gen_ai.workflow.name');
  });

  it('should define expected constant values', () => {
    assert.strictEqual(GEN_AI_OPERATION_NAME_VALUE_CHAT, 'chat');
    assert.strictEqual(
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
      'invoke_agent'
    );
    assert.strictEqual(
      GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
      'invoke_workflow'
    );
    assert.strictEqual(
      GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
      'execute_tool'
    );
    assert.strictEqual(GEN_AI_PROVIDER_NAME_VALUE_OPENAI, 'openai');
    assert.strictEqual(GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC, 'anthropic');
    assert.strictEqual(GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI, 'gcp.gen_ai');
    assert.strictEqual(
      GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI,
      'gcp.vertex_ai'
    );
    assert.strictEqual(GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI, 'gcp.gemini');
  });

  it('should define expected metric and event names', () => {
    assert.strictEqual(
      METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
      'gen_ai.client.operation.duration'
    );
    assert.strictEqual(
      METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
      'gen_ai.client.token.usage'
    );
    assert.strictEqual(
      EVENT_GEN_AI_CLIENT_INFERENCE_OPERATION_DETAILS,
      'gen_ai.client.inference.operation.details'
    );
    assert.strictEqual(
      EVENT_GEN_AI_CLIENT_OPERATION_EXCEPTION,
      'gen_ai.client.operation.exception'
    );
  });
});
