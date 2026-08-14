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
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
  EVENT_GEN_AI_CHOICE,
} from '../src';

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
    assert.strictEqual(ATTR_GEN_AI_INPUT_MESSAGES, 'gen_ai.input.messages');
    assert.strictEqual(ATTR_GEN_AI_OUTPUT_MESSAGES, 'gen_ai.output.messages');
  });

  it('should define expected constant values', () => {
    assert.strictEqual(GEN_AI_OPERATION_NAME_VALUE_CHAT, 'chat');
    assert.strictEqual(GEN_AI_PROVIDER_NAME_VALUE_OPENAI, 'openai');
    assert.strictEqual(GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC, 'anthropic');
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
    assert.strictEqual(EVENT_GEN_AI_CHOICE, 'gen_ai.choice');
  });
});
