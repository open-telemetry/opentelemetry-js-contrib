/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-expect-error -- TypeScript 5.0 misclassifies erased imports from ESM-only packages as runtime requires.
import type * as ClaudeAgentSDK from '@anthropic-ai/claude-agent-sdk';
import type { Attributes } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
} from '@opentelemetry/semantic-conventions/incubating';

const DEFAULT_AGENT_NAME = 'Claude Code';

export interface AgentRequestInfo {
  agentName: string;
  configuredModel?: string;
  initialAttributes: Attributes;
}

export function getAgentRequestInfo({
  prompt,
  options,
  captureMessageContent,
}: {
  prompt: string | AsyncIterable<unknown>;
  options: ClaudeAgentSDK.Options | undefined;
  captureMessageContent: boolean;
}): AgentRequestInfo {
  const agentName = getAgentName(options);
  const configuredModel = options?.model;

  const initialAttributes: Attributes = {
    [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
    [ATTR_GEN_AI_AGENT_NAME]: agentName,
  };

  if (configuredModel) {
    initialAttributes[ATTR_GEN_AI_REQUEST_MODEL] = configuredModel;
  }
  if (options?.resume) {
    initialAttributes[ATTR_GEN_AI_CONVERSATION_ID] = options.resume;
  }
  if (options?.outputFormat) {
    initialAttributes[ATTR_GEN_AI_OUTPUT_TYPE] = GEN_AI_OUTPUT_TYPE_VALUE_JSON;
  }

  if (captureMessageContent) {
    if (typeof prompt === 'string') {
      initialAttributes[ATTR_GEN_AI_INPUT_MESSAGES] = JSON.stringify([
        {
          role: 'user',
          parts: [{ type: 'text', content: prompt }],
        },
      ]);
    }

    const systemInstructions = getSystemInstructions(options?.systemPrompt);
    if (systemInstructions) {
      initialAttributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] = systemInstructions;
    }
  }

  return { agentName, configuredModel, initialAttributes };
}

export function isSystemInitMessage(
  message: ClaudeAgentSDK.SDKMessage
): message is ClaudeAgentSDK.SDKSystemMessage {
  return (
    message.type === 'system' &&
    'subtype' in message &&
    message.subtype === 'init'
  );
}

export function isResultMessage(
  message: ClaudeAgentSDK.SDKMessage
): message is ClaudeAgentSDK.SDKResultMessage {
  return message.type === 'result';
}

export function isResultSuccessMessage(
  message: ClaudeAgentSDK.SDKResultMessage
): message is ClaudeAgentSDK.SDKResultSuccess {
  return message.subtype === 'success';
}

export function isResultErrorMessage(
  message: ClaudeAgentSDK.SDKResultMessage
): message is ClaudeAgentSDK.SDKResultError {
  return message.subtype !== 'success';
}

export function isAssistantErrorMessage(
  message: ClaudeAgentSDK.SDKMessage
): message is ClaudeAgentSDK.SDKAssistantMessage & {
  error: NonNullable<ClaudeAgentSDK.SDKAssistantMessage['error']>;
} {
  return message.type === 'assistant' && message.error !== undefined;
}

export function getSystemMessageAttributes({
  message,
  configuredModel,
}: {
  message: ClaudeAgentSDK.SDKSystemMessage;
  configuredModel: string | undefined;
}): Attributes {
  const attributes: Attributes = {
    [ATTR_GEN_AI_CONVERSATION_ID]: message.session_id,
  };
  if (!configuredModel) {
    attributes[ATTR_GEN_AI_REQUEST_MODEL] = message.model;
  }
  return attributes;
}

export function getResultAttributes({
  message,
  captureMessageContent,
}: {
  message: ClaudeAgentSDK.SDKResultMessage;
  captureMessageContent: boolean;
}): Attributes {
  const attributes: Attributes = {
    [ATTR_GEN_AI_CONVERSATION_ID]: message.session_id,
    [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: message.usage.input_tokens,
    [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: message.usage.output_tokens,
    [ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]:
      message.usage.cache_creation_input_tokens,
    [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]:
      message.usage.cache_read_input_tokens,
  };

  const stopReason = getStopReason(message);
  if (stopReason) {
    attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS] = [stopReason];
  } else if (isResultSuccessMessage(message)) {
    attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS] = ['stop'];
  }

  if (captureMessageContent && isResultSuccessMessage(message)) {
    attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] = JSON.stringify([
      {
        role: 'assistant',
        parts: [{ type: 'text', content: message.result }],
        finish_reason: stopReason ?? 'stop',
      },
    ]);
  }

  return attributes;
}

export function getResultErrorMessage(
  message: ClaudeAgentSDK.SDKResultError
): string {
  return message.errors.length > 0
    ? message.errors.join('; ')
    : message.subtype;
}

export function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function getSystemInstructions(
  systemPrompt: ClaudeAgentSDK.Options['systemPrompt']
): string | undefined {
  let instructions: string[] = [];
  if (typeof systemPrompt === 'string') {
    instructions = [systemPrompt];
  } else if (Array.isArray(systemPrompt)) {
    instructions = systemPrompt;
  } else if (systemPrompt?.append) {
    instructions = [systemPrompt.append];
  }

  if (instructions.length === 0) {
    return undefined;
  }

  return JSON.stringify(
    instructions.map(content => ({ type: 'text', content }))
  );
}

function getAgentName(options: ClaudeAgentSDK.Options | undefined): string {
  const agent = options
    ? (Reflect.get(options, 'agent') as unknown)
    : undefined;
  return typeof agent === 'string' ? agent : DEFAULT_AGENT_NAME;
}

function getStopReason(
  message: ClaudeAgentSDK.SDKResultMessage
): string | undefined {
  const stopReason = Reflect.get(message, 'stop_reason') as unknown;
  return typeof stopReason === 'string' ? stopReason : undefined;
}
