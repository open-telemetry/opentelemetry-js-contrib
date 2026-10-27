/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ChatMiddlewareConfig,
  ModelMessage,
  StreamChunk,
  Tool as TanStackTool,
} from '@tanstack/ai';
import type {
  ChatMessage,
  OutputMessage,
  MessagePart,
  Role,
  TokenUsageDetails,
} from '@opentelemetry/genai-util';
import type { CurrentLLMSpanState, OutputToolCallInfo } from './types';

/**
 * Converts a TanStack AI ModelMessage into an OpenTelemetry GenAI ChatMessage.
 */
export function toGenAIInputMessage(message: ModelMessage): ChatMessage {
  const parts: MessagePart[] = [];

  if (typeof message.content === 'string' && message.content.length > 0) {
    parts.push({
      type: 'text',
      content: message.content,
    });
  }

  if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
    for (const tc of message.toolCalls) {
      parts.push({
        type: 'tool_call',
        id: tc.id,
        name: tc.function?.name ?? '',
        arguments: tc.function?.arguments,
      });
    }
  }

  if (message.toolCallId != null) {
    parts.push({
      type: 'tool_call_response',
      id: message.toolCallId,
      response: message.content,
    });
  }

  return {
    role: message.role as Role,
    parts,
  };
}

/**
 * Converts TanStack middleware config messages into GenAI input messages.
 */
export function getInputMessages(config: ChatMiddlewareConfig): ChatMessage[] {
  return config.messages.map(toGenAIInputMessage);
}

/**
 * Extracts system instructions from TanStack middleware config.
 * Supports both 0.10 (string array) and 1.x (strings or { content, metadata } objects).
 */
export function getSystemInstructions(
  config: ChatMiddlewareConfig
): string | undefined {
  if (!config.systemPrompts || config.systemPrompts.length === 0) {
    return undefined;
  }

  const parts = config.systemPrompts
    .map(p => {
      if (typeof p === 'string') {
        return p;
      }
      if (
        p &&
        typeof p === 'object' &&
        'content' in p &&
        typeof (p as { content: unknown }).content === 'string'
      ) {
        return (p as { content: string }).content;
      }
      return '';
    })
    .filter(s => s.length > 0);

  return parts.length > 0 ? parts.join('\n') : undefined;
}

/**
 * Converts TanStack token usage info into GenAI TokenUsageDetails.
 * Supports both 0.10 ({ promptTokens, completionTokens, totalTokens })
 * and 1.x (Array<SpecTokenUsage> or object).
 */
export function toTokenUsageDetails(
  usage: unknown
): TokenUsageDetails | undefined {
  if (!usage) {
    return undefined;
  }

  if (Array.isArray(usage)) {
    let inputTokenCount = 0;
    let outputTokenCount = 0;
    let totalTokenCount = 0;
    let hasAny = false;

    for (const u of usage) {
      if (u && typeof u === 'object') {
        const rec = u as Record<string, unknown>;
        const inTok =
          typeof rec.inputTokens === 'number'
            ? rec.inputTokens
            : typeof rec.promptTokens === 'number'
              ? rec.promptTokens
              : undefined;
        if (inTok !== undefined) {
          inputTokenCount += inTok;
          hasAny = true;
        }

        const outTok =
          typeof rec.outputTokens === 'number'
            ? rec.outputTokens
            : typeof rec.completionTokens === 'number'
              ? rec.completionTokens
              : undefined;
        if (outTok !== undefined) {
          outputTokenCount += outTok;
          hasAny = true;
        }

        if (typeof rec.totalTokens === 'number') {
          totalTokenCount += rec.totalTokens;
          hasAny = true;
        }
      }
    }

    if (!hasAny) {
      return undefined;
    }

    return {
      inputTokenCount,
      outputTokenCount,
      totalTokenCount: totalTokenCount || inputTokenCount + outputTokenCount,
    };
  }

  if (typeof usage === 'object') {
    const u = usage as Record<string, unknown>;
    const inTok =
      typeof u.inputTokens === 'number'
        ? u.inputTokens
        : typeof u.promptTokens === 'number'
          ? u.promptTokens
          : undefined;
    const outTok =
      typeof u.outputTokens === 'number'
        ? u.outputTokens
        : typeof u.completionTokens === 'number'
          ? u.completionTokens
          : undefined;
    const totalTokenCount =
      typeof u.totalTokens === 'number' ? u.totalTokens : undefined;

    if (
      inTok !== undefined ||
      outTok !== undefined ||
      totalTokenCount !== undefined
    ) {
      return {
        inputTokenCount: inTok,
        outputTokenCount: outTok,
        totalTokenCount: totalTokenCount ?? (inTok ?? 0) + (outTok ?? 0),
      };
    }
  }

  return undefined;
}

/**
 * Converts streamed output text and tool calls into a GenAI OutputMessage.
 */
export function toGenAIOutputMessage(
  outputText: string,
  toolCalls: OutputToolCallInfo[]
): OutputMessage | undefined {
  if (outputText.length === 0 && toolCalls.length === 0) {
    return undefined;
  }

  const parts: MessagePart[] = [];
  if (outputText.length > 0) {
    parts.push({
      type: 'text',
      content: outputText,
    });
  }

  for (const tc of toolCalls) {
    let parsedArgs: unknown = tc.arguments;
    try {
      if (typeof tc.arguments === 'string' && tc.arguments.trim().length > 0) {
        parsedArgs = JSON.parse(tc.arguments);
      }
    } catch {
      parsedArgs = tc.arguments;
    }
    parts.push({
      type: 'tool_call',
      id: tc.id,
      name: tc.name,
      arguments: parsedArgs,
    });
  }

  return {
    role: 'assistant',
    parts,
  };
}

/**
 * Extracts tool description from a TanStack tool.
 */
export function getToolDescription(
  tool: TanStackTool | undefined
): string | undefined {
  if (tool == null || typeof tool !== 'object') {
    return undefined;
  }
  const description = Reflect.get(tool, 'description');
  return typeof description === 'string' ? description : undefined;
}

/**
 * Initializes a new tool call tracking entry on TOOL_CALL_START.
 */
export function initializeToolCall(
  currentLLM: CurrentLLMSpanState,
  chunk: Extract<StreamChunk, { type: 'TOOL_CALL_START' }>
): void {
  currentLLM.outputToolCalls.set(chunk.toolCallId, {
    id: chunk.toolCallId,
    name: chunk.toolName,
    arguments: '',
  });
}

/**
 * Appends streaming arguments on TOOL_CALL_ARGS.
 */
export function updateToolCallArguments(
  currentLLM: CurrentLLMSpanState,
  chunk: Extract<StreamChunk, { type: 'TOOL_CALL_ARGS' }>
): void {
  const existing = currentLLM.outputToolCalls.get(chunk.toolCallId);
  if (existing && chunk.delta) {
    existing.arguments += chunk.delta;
  }
}

/**
 * Finalizes arguments on TOOL_CALL_END.
 */
export function completeToolCall(
  currentLLM: CurrentLLMSpanState,
  chunk: Extract<StreamChunk, { type: 'TOOL_CALL_END' }>
): void {
  const existing = currentLLM.outputToolCalls.get(chunk.toolCallId);
  if (existing && chunk.input != null) {
    existing.arguments =
      typeof chunk.input === 'string'
        ? chunk.input
        : JSON.stringify(chunk.input);
  }
}
