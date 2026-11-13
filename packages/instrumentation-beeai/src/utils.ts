/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GEN_AI_FINISH_REASON_VALUE_CONTENT_FILTER,
  GEN_AI_FINISH_REASON_VALUE_ERROR,
  GEN_AI_FINISH_REASON_VALUE_LENGTH,
  GEN_AI_FINISH_REASON_VALUE_STOP,
  GEN_AI_FINISH_REASON_VALUE_TOOL_CALL,
  GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
  GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_COHERE,
  GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK,
  GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI,
  GEN_AI_PROVIDER_NAME_VALUE_GROQ,
  GEN_AI_PROVIDER_NAME_VALUE_IBM_WATSONX_AI,
  GEN_AI_PROVIDER_NAME_VALUE_MISTRAL,
  GEN_AI_PROVIDER_NAME_VALUE_OLLAMA,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_PERPLEXITY,
  GEN_AI_PROVIDER_NAME_VALUE_X_AI,
  type ChatMessage,
  type FinishReason,
  type InferenceRequestOptions,
  type InputMessages,
  type LocalAgentRequestOptions,
  type MessagePart,
  type Modality,
  type OutputMessage,
  type OutputMessages,
  type SystemInstructions,
  type TokenUsageDetails,
} from '@opentelemetry/genai-util';

const DEFAULT_IGNORE_KEYS = [
  'emitter',
  'logger',
  'tokens',
  'createdBy',
  'client',
];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads an own data property without invoking getter-backed deprecation warnings
 * (such as `args` or `result` on newer BeeAI message parts).
 */
export function ownDataValue(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

export function mapProviderName(providerId: unknown): string {
  if (typeof providerId !== 'string') {
    return 'beeai';
  }
  const trimmed = providerId.trim();
  if (!trimmed) {
    return 'beeai';
  }
  const normalized = trimmed.toLowerCase();
  switch (normalized) {
    case 'openai':
      return GEN_AI_PROVIDER_NAME_VALUE_OPENAI;
    case 'anthropic':
      return GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC;
    case 'ollama':
      return GEN_AI_PROVIDER_NAME_VALUE_OLLAMA;
    case 'watsonx':
    case 'ibm':
    case 'ibm.watsonx.ai':
      return GEN_AI_PROVIDER_NAME_VALUE_IBM_WATSONX_AI;
    case 'google-vertex':
    case 'googlevertex':
    case 'vertex':
    case 'google':
    case 'gcp.vertex_ai':
      return GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI;
    case 'amazon-bedrock':
    case 'amazonbedrock':
    case 'bedrock':
    case 'amazon':
    case 'aws.bedrock':
      return GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK;
    case 'azure':
    case 'azure-openai':
    case 'azureopenai':
    case 'microsoft':
    case 'microsoft-azure':
    case 'azure.ai.openai':
      return GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI;
    case 'groq':
      return GEN_AI_PROVIDER_NAME_VALUE_GROQ;
    case 'xai':
    case 'x_ai':
    case 'grok':
      return GEN_AI_PROVIDER_NAME_VALUE_X_AI;
    case 'cohere':
      return GEN_AI_PROVIDER_NAME_VALUE_COHERE;
    case 'deepseek':
      return GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK;
    case 'mistral':
    case 'mistral_ai':
      return GEN_AI_PROVIDER_NAME_VALUE_MISTRAL;
    case 'perplexity':
      return GEN_AI_PROVIDER_NAME_VALUE_PERPLEXITY;
    default:
      return trimmed;
  }
}

export function mapFinishReason(reason: unknown): FinishReason | undefined {
  if (typeof reason !== 'string') {
    return undefined;
  }
  const trimmed = reason.trim();
  if (!trimmed) {
    return undefined;
  }
  switch (trimmed.toLowerCase()) {
    case 'stop':
      return GEN_AI_FINISH_REASON_VALUE_STOP;
    case 'length':
      return GEN_AI_FINISH_REASON_VALUE_LENGTH;
    case 'content-filter':
    case 'content_filter':
      return GEN_AI_FINISH_REASON_VALUE_CONTENT_FILTER;
    case 'tool-calls':
    case 'tool_calls':
    case 'tool_call':
      return GEN_AI_FINISH_REASON_VALUE_TOOL_CALL;
    case 'error':
      return GEN_AI_FINISH_REASON_VALUE_ERROR;
    default:
      return trimmed;
  }
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (item): item is string => typeof item === 'string'
  );
  return strings.length > 0 ? strings : undefined;
}

export function extractInferenceRequestOptions(
  parameters: unknown,
  input: unknown,
  isStreaming: boolean
): InferenceRequestOptions {
  const merged: Record<string, unknown> = {
    ...(isRecord(parameters) ? parameters : {}),
    ...(isRecord(input) ? input : {}),
  };

  const options: InferenceRequestOptions = {};
  const temperature = asFiniteNumber(merged.temperature);
  if (temperature !== undefined) options.temperature = temperature;

  const topP = asFiniteNumber(merged.topP);
  if (topP !== undefined) options.topP = topP;

  const topK = asFiniteNumber(merged.topK);
  if (topK !== undefined) options.topK = topK;

  const maxTokens = asFiniteNumber(merged.maxTokens);
  if (maxTokens !== undefined) options.maxTokens = maxTokens;

  const stopSequences = asStringArray(merged.stopSequences);
  if (stopSequences !== undefined) options.stopSequences = stopSequences;

  const frequencyPenalty = asFiniteNumber(merged.frequencyPenalty);
  if (frequencyPenalty !== undefined) {
    options.frequencyPenalty = frequencyPenalty;
  }

  const presencePenalty = asFiniteNumber(merged.presencePenalty);
  if (presencePenalty !== undefined) options.presencePenalty = presencePenalty;

  const choiceCount = asFiniteNumber(merged.n);
  if (choiceCount !== undefined) options.choiceCount = choiceCount;

  const seed = asFiniteNumber(merged.seed);
  if (seed !== undefined) options.seed = seed;

  if (isStreaming) {
    options.stream = true;
  }

  return options;
}

export function extractAgentRequestOptions(
  parameters: unknown
): LocalAgentRequestOptions | undefined {
  if (!isRecord(parameters)) return undefined;
  const options: LocalAgentRequestOptions = {};
  const temperature = asFiniteNumber(parameters.temperature);
  if (temperature !== undefined) options.temperature = temperature;

  const topP = asFiniteNumber(parameters.topP);
  if (topP !== undefined) options.topP = topP;

  const maxTokens = asFiniteNumber(parameters.maxTokens);
  if (maxTokens !== undefined) options.maxTokens = maxTokens;

  const stopSequences = asStringArray(parameters.stopSequences);
  if (stopSequences !== undefined) options.stopSequences = stopSequences;

  const frequencyPenalty = asFiniteNumber(parameters.frequencyPenalty);
  if (frequencyPenalty !== undefined) {
    options.frequencyPenalty = frequencyPenalty;
  }

  const presencePenalty = asFiniteNumber(parameters.presencePenalty);
  if (presencePenalty !== undefined) options.presencePenalty = presencePenalty;

  const choiceCount = asFiniteNumber(parameters.n);
  if (choiceCount !== undefined) options.choiceCount = choiceCount;

  const seed = asFiniteNumber(parameters.seed);
  if (seed !== undefined) options.seed = seed;

  return Object.keys(options).length > 0 ? options : undefined;
}

export function extractTokenUsage(
  usage: unknown
): TokenUsageDetails | undefined {
  if (!isRecord(usage)) return undefined;
  const details: TokenUsageDetails = {};
  const inputTokenCount = asFiniteNumber(usage.promptTokens);
  if (inputTokenCount !== undefined) {
    details.inputTokenCount = inputTokenCount;
  }
  const outputTokenCount = asFiniteNumber(usage.completionTokens);
  if (outputTokenCount !== undefined) {
    details.outputTokenCount = outputTokenCount;
  }
  const reasoningTokenCount = asFiniteNumber(usage.reasoningTokens);
  if (reasoningTokenCount !== undefined) {
    details.reasoningTokenCount = reasoningTokenCount;
  }
  const cacheReadTokenCount = asFiniteNumber(usage.cachedPromptTokens);
  if (cacheReadTokenCount !== undefined) {
    details.cacheReadTokenCount = cacheReadTokenCount;
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

function inferModalityFromMimeType(
  mimeType: string | undefined,
  fallback: Modality
): Modality {
  if (!mimeType) return fallback;
  const lower = mimeType.toLowerCase();
  if (lower.startsWith('image/')) return 'image';
  if (lower.startsWith('audio/')) return 'audio';
  if (lower.startsWith('video/')) return 'video';
  return fallback;
}

function convertBinaryOrUriPart(
  rawData: unknown,
  mimeType: string | undefined,
  defaultModality: Modality
): MessagePart | undefined {
  const modality = inferModalityFromMimeType(mimeType, defaultModality);
  if (rawData instanceof URL) {
    return {
      type: 'uri',
      modality,
      uri: rawData.href,
      ...(mimeType ? { mime_type: mimeType } : {}),
    };
  }
  if (rawData instanceof Uint8Array) {
    return {
      type: 'blob',
      modality,
      content: rawData,
      ...(mimeType ? { mime_type: mimeType } : {}),
    };
  }
  if (rawData instanceof ArrayBuffer) {
    return {
      type: 'blob',
      modality,
      content: new Uint8Array(rawData),
      ...(mimeType ? { mime_type: mimeType } : {}),
    };
  }
  if (typeof rawData === 'string') {
    const trimmed = rawData.trim();
    const dataUrlMatch = /^data:([^;,]+)?;base64,(.+)$/is.exec(trimmed);
    if (dataUrlMatch) {
      const detectedMime = dataUrlMatch[1] || mimeType;
      return {
        type: 'blob',
        modality: inferModalityFromMimeType(detectedMime, defaultModality),
        content: new Uint8Array(Buffer.from(dataUrlMatch[2], 'base64')),
        ...(detectedMime ? { mime_type: detectedMime } : {}),
      };
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
      return {
        type: 'uri',
        modality,
        uri: trimmed,
        ...(mimeType ? { mime_type: mimeType } : {}),
      };
    }
    return {
      type: 'blob',
      modality,
      content: new Uint8Array(Buffer.from(trimmed, 'base64')),
      ...(mimeType ? { mime_type: mimeType } : {}),
    };
  }
  return undefined;
}

function extractToolResultValue(part: Record<string, unknown>): unknown {
  const output = ownDataValue(part, 'output');
  if (isRecord(output) && 'value' in output) {
    return output.value;
  }
  if (output !== undefined) {
    return output;
  }
  return ownDataValue(part, 'result');
}

function convertBeeAIPart(part: unknown): MessagePart | undefined {
  if (typeof part === 'string') {
    return { type: 'text', content: part };
  }
  if (!isRecord(part)) {
    return undefined;
  }
  const type = typeof part.type === 'string' ? part.type : '';
  switch (type) {
    case 'text': {
      const text =
        typeof part.text === 'string'
          ? part.text
          : typeof part.content === 'string'
            ? part.content
            : '';
      return { type: 'text', content: text };
    }
    case 'tool-call':
    case 'tool_call': {
      const name =
        typeof part.toolName === 'string'
          ? part.toolName
          : typeof part.name === 'string'
            ? part.name
            : '';
      if (!name) return undefined;
      const id =
        typeof part.toolCallId === 'string'
          ? part.toolCallId
          : typeof part.id === 'string'
            ? part.id
            : undefined;
      const args =
        ownDataValue(part, 'input') !== undefined
          ? ownDataValue(part, 'input')
          : ownDataValue(part, 'args') !== undefined
            ? ownDataValue(part, 'args')
            : ownDataValue(part, 'arguments');
      return {
        type: 'tool_call',
        name,
        ...(id ? { id } : {}),
        ...(args !== undefined ? { arguments: args } : {}),
      };
    }
    case 'tool-result':
    case 'tool_call_response': {
      const id =
        typeof part.toolCallId === 'string'
          ? part.toolCallId
          : typeof part.id === 'string'
            ? part.id
            : undefined;
      const response = extractToolResultValue(part);
      return {
        type: 'tool_call_response',
        ...(id ? { id } : {}),
        response,
      };
    }
    case 'reasoning': {
      const text =
        typeof part.text === 'string'
          ? part.text
          : typeof part.content === 'string'
            ? part.content
            : '';
      return { type: 'reasoning', content: text };
    }
    case 'image': {
      const mimeType =
        typeof part.mimeType === 'string'
          ? part.mimeType
          : typeof part.mediaType === 'string'
            ? part.mediaType
            : undefined;
      return convertBinaryOrUriPart(part.image, mimeType, 'image');
    }
    case 'file': {
      const mimeType =
        typeof part.mimeType === 'string'
          ? part.mimeType
          : typeof part.mediaType === 'string'
            ? part.mediaType
            : undefined;
      return convertBinaryOrUriPart(part.data, mimeType, 'document');
    }
    default: {
      if (type) {
        return { ...part, type };
      }
      if (typeof part.text === 'string') {
        return { type: 'text', content: part.text };
      }
      return undefined;
    }
  }
}

export function convertBeeAIMessage(message: unknown): ChatMessage | undefined {
  if (!isRecord(message)) return undefined;
  const role =
    typeof message.role === 'string' && message.role.trim()
      ? message.role.trim()
      : 'user';

  const parts: MessagePart[] = [];
  if (Array.isArray(message.content)) {
    for (const rawPart of message.content) {
      const converted = convertBeeAIMartSafe(rawPart);
      if (converted) parts.push(converted);
    }
  } else if (typeof message.content === 'string') {
    parts.push({ type: 'text', content: message.content });
  } else if (typeof message.text === 'string') {
    parts.push({ type: 'text', content: message.text });
  }

  if (parts.length === 0) {
    return undefined;
  }

  return { role, parts };
}

function convertBeeAIMartSafe(rawPart: unknown): MessagePart | undefined {
  try {
    return convertBeeAIPart(rawPart);
  } catch {
    return undefined;
  }
}

export function extractMessagesAndSystemInstructions(messages: unknown): {
  inputMessages: InputMessages;
  systemInstructions: SystemInstructions;
} {
  const inputMessages: InputMessages = [];
  const systemInstructions: SystemInstructions = [];

  if (!Array.isArray(messages)) {
    return { inputMessages, systemInstructions };
  }

  for (const rawMessage of messages) {
    const converted = convertBeeAIMessage(rawMessage);
    if (!converted) continue;

    if (converted.role === 'system') {
      for (const part of converted.parts) {
        if (part.type === 'text') {
          systemInstructions.push({ type: 'text', content: part.content });
        } else {
          systemInstructions.push(part);
        }
      }
    } else {
      inputMessages.push(converted);
    }
  }

  return { inputMessages, systemInstructions };
}

export function extractOutputMessages(
  messages: unknown,
  fallbackObject?: unknown
): OutputMessages {
  const outputMessages: OutputMessages = [];
  if (Array.isArray(messages)) {
    for (const rawMessage of messages) {
      const converted = convertBeeAIMessage(rawMessage);
      if (converted) {
        outputMessages.push(converted as OutputMessage);
      }
    }
  }
  if (outputMessages.length === 0 && fallbackObject !== undefined) {
    const content =
      typeof fallbackObject === 'string'
        ? fallbackObject
        : JSON.stringify(fallbackObject);
    if (content) {
      outputMessages.push({
        role: 'assistant',
        parts: [{ type: 'text', content }],
      });
    }
  }
  return outputMessages;
}

export function extractAgentInput(
  agentInstance: unknown,
  inputArg: unknown
): {
  inputMessages: InputMessages;
  systemInstructions: SystemInstructions;
} {
  const memoryMessages =
    isRecord(agentInstance) && isRecord(agentInstance.memory)
      ? agentInstance.memory.messages
      : undefined;

  const { inputMessages, systemInstructions } =
    extractMessagesAndSystemInstructions(memoryMessages);

  let promptText: string | undefined;
  if (typeof inputArg === 'string') {
    promptText = inputArg;
  } else if (isRecord(inputArg)) {
    if (typeof inputArg.prompt === 'string') {
      promptText = inputArg.prompt;
    } else if (typeof inputArg.input === 'string') {
      promptText = inputArg.input;
    } else if (Array.isArray(inputArg.messages)) {
      const extra = extractMessagesAndSystemInstructions(inputArg.messages);
      systemInstructions.push(...extra.systemInstructions);
      inputMessages.push(...extra.inputMessages);
    } else if (isRecord(inputArg.input) || Array.isArray(inputArg.input)) {
      const rawList = Array.isArray(inputArg.input)
        ? inputArg.input
        : [inputArg.input];
      const extra = extractMessagesAndSystemInstructions(rawList);
      systemInstructions.push(...extra.systemInstructions);
      inputMessages.push(...extra.inputMessages);
    }
  }

  if (promptText && promptText.length > 0) {
    const lastMsg = inputMessages[inputMessages.length - 1];
    const lastPart = lastMsg?.parts[0];
    const isDuplicate =
      lastMsg?.role === 'user' &&
      lastMsg.parts.length === 1 &&
      lastPart?.type === 'text' &&
      lastPart.content === promptText;
    if (!isDuplicate) {
      inputMessages.push({
        role: 'user',
        parts: [{ type: 'text', content: promptText }],
      });
    }
  }

  return { inputMessages, systemInstructions };
}

export function extractAgentOutputMessages(
  result: unknown,
  fallbackMessage?: { role: string; text: string }
): OutputMessages {
  if (isRecord(result)) {
    const innerResult = result.result;
    if (innerResult !== undefined) {
      const converted = convertBeeAIMessage(innerResult);
      if (converted) {
        return [converted];
      }
    }
    const direct = convertBeeAIMessage(result);
    if (direct) {
      return [direct];
    }
  }

  if (fallbackMessage && typeof fallbackMessage.text === 'string') {
    return [
      {
        role: fallbackMessage.role || 'assistant',
        parts: [{ type: 'text', content: fallbackMessage.text }],
      },
    ];
  }

  return [];
}

/**
 * Serializer that strips internal BeeAI framework references (`emitter`, `logger`,
 * `tokens`, `createdBy`, `client`, and `_`-prefixed private properties) as well as
 * any caller-configured keys.
 */
export function traceSerializer({
  ignored_keys = [],
}: {
  ignored_keys?: string[];
} = {}): (body: unknown) => string {
  const envKeys = process.env.BEE_FRAMEWORK_INSTRUMENTATION_IGNORED_KEYS
    ? process.env.BEE_FRAMEWORK_INSTRUMENTATION_IGNORED_KEYS.split(',').filter(
        Boolean
      )
    : [];
  const mergedIgnoreKeys = new Set([
    ...DEFAULT_IGNORE_KEYS,
    ...envKeys,
    ...ignored_keys,
  ]);

  return (body: unknown) =>
    JSON.stringify(body, (key, value) => {
      if (key && (mergedIgnoreKeys.has(key) || key.startsWith('_'))) {
        return undefined;
      }
      return value;
    });
}

export function sanitizeToolValue(
  value: unknown,
  ignoredKeys?: string[]
): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (isRecord(value)) {
    if ('result' in value && value.result !== undefined) {
      const inner = value.result;
      if (typeof inner === 'string') {
        return inner;
      }
      return sanitizeObject(inner, ignoredKeys);
    }
    if (typeof value.getTextContent === 'function') {
      try {
        const text = (value.getTextContent as () => unknown)();
        if (typeof text === 'string') return text;
      } catch {
        // Fall through to object sanitization
      }
    }
  }
  return sanitizeObject(value, ignoredKeys);
}

function sanitizeObject(value: unknown, ignoredKeys?: string[]): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  try {
    const serialized = traceSerializer({ ignored_keys: ignoredKeys })(value);
    return serialized !== undefined ? JSON.parse(serialized) : value;
  } catch {
    return value;
  }
}
