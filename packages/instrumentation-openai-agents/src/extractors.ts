/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  OpenAIAgentsSpanData,
  OpenAIAgentsToolLike,
} from './internal-types';
import type {
  ChatMessage,
  FinishReason,
  InputMessages,
  LocalAgentRequestOptions,
  MessagePart,
  OutputMessages,
  SystemInstructions,
  ToolDefinitions,
} from './semconv';

export interface ModelCallTelemetry {
  requestModel?: string;
  responseModel?: string;
  requestOptions?: LocalAgentRequestOptions;
  finishReasons?: FinishReason[];
  inputTokens?: number;
  outputTokens?: number;
  systemInstructions?: SystemInstructions;
  inputMessages?: InputMessages;
  outputMessages?: OutputMessages;
}

export interface ExtractedAgentTools {
  toolDescriptions: Map<string, string>;
  toolDefinitions?: ToolDefinitions;
}

export function asObject<T extends object>(value: unknown): T | undefined {
  return value !== null && typeof value === 'object'
    ? (value as T)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function parseJsonOrRaw(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function extractTextParts(content: unknown): MessagePart[] {
  if (typeof content === 'string') {
    return content ? [{ type: 'text', content }] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  const parts: MessagePart[] = [];
  for (const item of content) {
    if (!isRecord(item)) {
      continue;
    }
    const type = item.type;
    if (
      (type === 'text' || type === 'input_text' || type === 'output_text') &&
      typeof item.text === 'string'
    ) {
      parts.push({ type: 'text', content: item.text });
    } else if (type === 'refusal' && typeof item.refusal === 'string') {
      parts.push({ type: 'refusal', refusal: item.refusal });
    }
  }
  return parts;
}

function appendSystemTextParts(
  content: unknown,
  target: SystemInstructions
): void {
  for (const part of extractTextParts(content)) {
    if (part.type === 'text' && typeof part.content === 'string') {
      target.push({ type: 'text', content: part.content });
    }
  }
}

function appendToolCallParts(toolCalls: unknown, target: MessagePart[]): void {
  if (!Array.isArray(toolCalls)) {
    return;
  }
  for (const call of toolCalls) {
    if (!isRecord(call) || !isRecord(call.function)) {
      continue;
    }
    if (typeof call.function.name === 'string') {
      target.push({
        type: 'tool_call',
        id: typeof call.id === 'string' ? call.id : undefined,
        name: call.function.name,
        arguments: parseJsonOrRaw(call.function.arguments),
      });
    }
  }
}

function buildRequestOptions(
  raw: Record<string, unknown> | undefined
): LocalAgentRequestOptions | undefined {
  if (!raw) {
    return undefined;
  }
  const options: LocalAgentRequestOptions = {};
  let hasAny = false;
  if (typeof raw.temperature === 'number') {
    options.temperature = raw.temperature;
    hasAny = true;
  }
  if (typeof raw.top_p === 'number') {
    options.topP = raw.top_p;
    hasAny = true;
  }
  const maxTokens = raw.max_tokens ?? raw.max_output_tokens;
  if (typeof maxTokens === 'number') {
    options.maxTokens = maxTokens;
    hasAny = true;
  }
  if (typeof raw.frequency_penalty === 'number') {
    options.frequencyPenalty = raw.frequency_penalty;
    hasAny = true;
  }
  if (typeof raw.presence_penalty === 'number') {
    options.presencePenalty = raw.presence_penalty;
    hasAny = true;
  }
  return hasAny ? options : undefined;
}

export function extractCallId(
  item: { call_id?: unknown; callId?: unknown; id?: unknown } | undefined
): string | undefined {
  if (!item) {
    return undefined;
  }
  return (
    nonEmptyString(item.call_id) ??
    nonEmptyString(item.callId) ??
    nonEmptyString(item.id)
  );
}

function convertResponsesItem(
  item: Record<string, unknown>
): ChatMessage | undefined {
  const type = item.type;
  if (type === 'function_call' && typeof item.name === 'string') {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: extractCallId(item),
          name: item.name,
          arguments: parseJsonOrRaw(item.arguments),
        },
      ],
    };
  }
  if (type === 'function_call_output' || type === 'function_call_result') {
    return {
      role: 'tool',
      parts: [
        {
          type: 'tool_call_response',
          id: extractCallId(item),
          response: item.output,
        },
      ],
    };
  }
  if (type === 'reasoning' && Array.isArray(item.summary)) {
    const parts: MessagePart[] = [];
    for (const summary of item.summary) {
      if (isRecord(summary) && typeof summary.text === 'string') {
        parts.push({ type: 'reasoning', content: summary.text });
      }
    }
    return parts.length > 0 ? { role: 'assistant', parts } : undefined;
  }
  if (typeof item.role === 'string') {
    const parts = extractTextParts(item.content);
    return parts.length > 0 ? { role: item.role, parts } : undefined;
  }
  return undefined;
}

function extractTokenUsage(raw: unknown): {
  inputTokens?: number;
  outputTokens?: number;
} {
  if (!isRecord(raw)) {
    return {};
  }
  const inputTokens =
    typeof raw.input_tokens === 'number' && raw.input_tokens >= 0
      ? raw.input_tokens
      : undefined;
  const outputTokens =
    typeof raw.output_tokens === 'number' && raw.output_tokens >= 0
      ? raw.output_tokens
      : undefined;
  return { inputTokens, outputTokens };
}

/**
 * Extract model, request options, finish reasons, and optional messages from a
 * Chat Completions `generation` span.
 */
export function extractGenerationTelemetry(
  data: OpenAIAgentsSpanData,
  captureContent: boolean
): ModelCallTelemetry {
  const finishReasons: FinishReason[] = [];
  const systemInstructions: SystemInstructions = [];
  const inputMessages: InputMessages = [];
  const outputMessages: OutputMessages = [];

  if (captureContent && Array.isArray(data.input)) {
    for (const raw of data.input) {
      if (!isRecord(raw) || typeof raw.role !== 'string') {
        continue;
      }
      if (raw.role === 'system' || raw.role === 'developer') {
        appendSystemTextParts(raw.content, systemInstructions);
        continue;
      }
      if (raw.role === 'tool') {
        inputMessages.push({
          role: 'tool',
          parts: [
            {
              type: 'tool_call_response',
              id:
                typeof raw.tool_call_id === 'string'
                  ? raw.tool_call_id
                  : undefined,
              response: raw.content,
            },
          ],
        });
        continue;
      }
      const parts = extractTextParts(raw.content);
      appendToolCallParts(raw.tool_calls, parts);
      if (parts.length > 0) {
        inputMessages.push({ role: raw.role, parts });
      }
    }
  }

  if (Array.isArray(data.output)) {
    for (const raw of data.output) {
      if (!isRecord(raw)) {
        continue;
      }
      if (Array.isArray(raw.choices)) {
        for (const choice of raw.choices) {
          if (!isRecord(choice)) {
            continue;
          }
          if (typeof choice.finish_reason === 'string') {
            finishReasons.push(choice.finish_reason);
          }
          if (!captureContent || !isRecord(choice.message)) {
            continue;
          }
          const msg = choice.message;
          const parts = extractTextParts(msg.content);
          if (typeof msg.refusal === 'string' && msg.refusal) {
            parts.push({ type: 'refusal', refusal: msg.refusal });
          }
          appendToolCallParts(msg.tool_calls, parts);
          if (parts.length > 0) {
            outputMessages.push({
              role: typeof msg.role === 'string' ? msg.role : 'assistant',
              parts,
            });
          }
        }
      } else if (captureContent && typeof raw.role === 'string') {
        const parts = extractTextParts(raw.content);
        if (parts.length > 0) {
          outputMessages.push({ role: raw.role, parts });
        }
      }
    }
  }

  const { inputTokens, outputTokens } = extractTokenUsage(data.usage);

  return {
    requestModel: nonEmptyString(data.model),
    requestOptions: buildRequestOptions(data.model_config),
    finishReasons: finishReasons.length > 0 ? finishReasons : undefined,
    inputTokens,
    outputTokens,
    systemInstructions:
      systemInstructions.length > 0 ? systemInstructions : undefined,
    inputMessages: inputMessages.length > 0 ? inputMessages : undefined,
    outputMessages: outputMessages.length > 0 ? outputMessages : undefined,
  };
}

/**
 * Extract resolved response model, request options, and optional messages from
 * an OpenAI Responses API `response` span.
 */
export function extractResponseTelemetry(
  data: OpenAIAgentsSpanData,
  captureContent: boolean
): ModelCallTelemetry {
  const response = isRecord(data._response) ? data._response : undefined;
  const { inputTokens, outputTokens } = extractTokenUsage(response?.usage);
  const telemetry: ModelCallTelemetry = {
    responseModel: response ? nonEmptyString(response.model) : undefined,
    requestOptions: buildRequestOptions(response),
    inputTokens,
    outputTokens,
  };
  if (!captureContent) {
    return telemetry;
  }

  const systemInstructions: SystemInstructions = [];
  const inputMessages: InputMessages = [];
  const outputMessages: OutputMessages = [];

  if (
    response &&
    typeof response.instructions === 'string' &&
    response.instructions
  ) {
    systemInstructions.push({ type: 'text', content: response.instructions });
  }

  if (typeof data._input === 'string' && data._input) {
    inputMessages.push({
      role: 'user',
      parts: [{ type: 'text', content: data._input }],
    });
  } else if (Array.isArray(data._input)) {
    for (const raw of data._input) {
      if (!isRecord(raw)) {
        continue;
      }
      if (raw.role === 'system' || raw.role === 'developer') {
        appendSystemTextParts(raw.content, systemInstructions);
        continue;
      }
      const msg = convertResponsesItem(raw);
      if (msg) {
        inputMessages.push(msg);
      }
    }
  }

  if (response && Array.isArray(response.output)) {
    for (const raw of response.output) {
      if (!isRecord(raw)) {
        continue;
      }
      const msg = convertResponsesItem(raw);
      if (msg) {
        outputMessages.push(msg);
      }
    }
  }

  return {
    ...telemetry,
    systemInstructions:
      systemInstructions.length > 0 ? systemInstructions : undefined,
    inputMessages: inputMessages.length > 0 ? inputMessages : undefined,
    outputMessages: outputMessages.length > 0 ? outputMessages : undefined,
  };
}

/**
 * Extract tool descriptions and GenAI tool definitions in a single pass over
 * an OpenAI Agents SDK `Agent.tools` list.
 */
export function extractAgentTools(
  tools: unknown[] | undefined,
  includeDefinitions = true
): ExtractedAgentTools {
  const toolDescriptions = new Map<string, string>();
  if (!Array.isArray(tools) || tools.length === 0) {
    return { toolDescriptions };
  }
  const definitions: ToolDefinitions | undefined = includeDefinitions
    ? []
    : undefined;
  for (const raw of tools) {
    if (!isRecord(raw)) {
      continue;
    }
    const tool = raw as OpenAIAgentsToolLike;
    const name = nonEmptyString(tool.name);
    if (!name) {
      continue;
    }
    const description = nonEmptyString(tool.description);
    if (description) {
      toolDescriptions.set(name, description);
    }
    definitions?.push({
      type: typeof tool.type === 'string' ? tool.type : 'function',
      name,
      ...(description ? { description } : undefined),
      ...(tool.parameters !== undefined
        ? { parameters: tool.parameters }
        : undefined),
    });
  }
  return {
    toolDescriptions,
    toolDefinitions:
      definitions && definitions.length > 0 ? definitions : undefined,
  };
}
