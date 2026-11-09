/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Attributes } from '@opentelemetry/api';
import type {
  ChatMessage,
  EmbeddingInvocation,
  FinishReason,
  InferenceInvocation,
  InferenceRequestOptions,
  MessagePart,
  OutputMessage,
  SystemInstructionPart,
  TokenUsageDetails,
} from '@opentelemetry/genai-util';
import { ATTR_AWS_BEDROCK_GUARDRAIL_ID, ATTR_GEN_AI_OUTPUT_TYPE } from '../../semconv';

type AnyRecord = Record<string, any>;

export function isRecord(val: unknown): val is AnyRecord {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function firstDefined(...values: unknown[]): any {
  for (const val of values) {
    if (val !== undefined && val !== null) {
      return val;
    }
  }
  return undefined;
}

export function toInt(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return Number.isFinite(num) ? Math.trunc(num) : undefined;
}

function toFloat(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return Number.isFinite(num) ? num : undefined;
}

const FINISH_REASON_MAP: Record<string, FinishReason> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  tool_use: 'tool_call',
  max_tokens: 'length',
  content_filtered: 'content_filter',
  guardrail_intervened: 'content_filter',
  finish: 'stop',
  complete: 'stop',
  endoftext: 'stop',
  length: 'length',
  stop: 'stop',
  tool_calls: 'tool_call',
};

const DOC_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  html: 'text/html',
  txt: 'text/plain',
  md: 'text/markdown',
};

/**
 * Map a Bedrock stop reason to a GenAI semantic convention finish reason.
 */
export function mapFinishReason(
  stopReason: unknown
): FinishReason | undefined {
  if (typeof stopReason !== 'string' || stopReason === '') return undefined;
  const lower = stopReason.toLowerCase();
  return FINISH_REASON_MAP[lower] ?? lower;
}

/**
 * Parse `server.address` and `server.port` from a resolved endpoint URL.
 */
export function extractServerAddressAndPort(endpoint: string | undefined): {
  serverAddress?: string;
  serverPort?: number;
} {
  if (!endpoint) return {};
  try {
    const url = new URL(endpoint);
    let serverPort = url.port ? Number(url.port) : undefined;
    if (serverPort === undefined) {
      if (url.protocol === 'https:') serverPort = 443;
      else if (url.protocol === 'http:') serverPort = 80;
    }
    return { serverAddress: url.hostname, serverPort };
  } catch {
    return {};
  }
}

function decodeBase64(data: unknown): Uint8Array | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    return Buffer.from(data, 'base64');
  } catch {
    return undefined;
  }
}

function toBytes(val: unknown): Uint8Array {
  return val instanceof Uint8Array ? val : new Uint8Array();
}

/**
 * Map a single Converse or Anthropic-style content block to a message part.
 */
export function extractContentBlock(block: AnyRecord): MessagePart | undefined {
  const blockType = block.type;

  // Text block (Converse or Anthropic)
  if (typeof block.text === 'string' && (blockType === 'text' || blockType === undefined)) {
    return { type: 'text', content: block.text };
  }

  // Reasoning / thinking block
  const reasoning = block.reasoningContent;
  if (isRecord(reasoning) && isRecord(reasoning.reasoningText)) {
    if (typeof reasoning.reasoningText.text === 'string') {
      return { type: 'reasoning', content: reasoning.reasoningText.text };
    }
  }
  if (blockType === 'thinking' || blockType === 'redacted_thinking') {
    return {
      type: 'reasoning',
      content: String(block.thinking || block.data || ''),
    };
  }

  // Image block
  if (isRecord(block.image)) {
    const source = block.image.source;
    return {
      type: 'blob',
      modality: 'image',
      mime_type: `image/${block.image.format ?? 'jpeg'}`,
      content: toBytes(isRecord(source) ? source.bytes : undefined),
    };
  }
  if (blockType === 'image' && isRecord(block.source)) {
    const blob = extractSourceBlob(block.source, 'image', 'image/jpeg');
    if (blob) return blob;
  }

  // Document block
  if (isRecord(block.document)) {
    const format = block.document.format ?? 'pdf';
    const source = block.document.source;
    return {
      type: 'blob',
      modality: 'document',
      mime_type:
        typeof format === 'string'
          ? (DOC_MIME_TYPES[format] ?? `application/${format}`)
          : undefined,
      content: toBytes(isRecord(source) ? source.bytes : undefined),
    };
  }
  if (blockType === 'document' && isRecord(block.source)) {
    const blob = extractSourceBlob(block.source, 'document', 'application/pdf');
    if (blob) return blob;
  }

  // Tool use (Converse toolUse or Anthropic tool_use)
  if (isRecord(block.toolUse)) {
    return {
      type: 'tool_call',
      id: block.toolUse.toolUseId,
      name: String(block.toolUse.name ?? ''),
      arguments: block.toolUse.input,
    };
  }
  if (blockType === 'tool_use') {
    return {
      type: 'tool_call',
      id: block.id,
      name: String(block.name ?? ''),
      arguments: block.input,
    };
  }

  // Tool result (Converse toolResult or Anthropic tool_result)
  if (isRecord(block.toolResult)) {
    return {
      type: 'tool_call_response',
      id: block.toolResult.toolUseId,
      response: block.toolResult.content,
    };
  }
  if (blockType === 'tool_result') {
    return {
      type: 'tool_call_response',
      id: block.tool_use_id,
      response: block.content,
    };
  }

  return undefined;
}

function extractSourceBlob(
  source: AnyRecord,
  modality: 'image' | 'document',
  defaultMimeType: string
): MessagePart | undefined {
  if (source.type === 'base64') {
    const decoded = decodeBase64(source.data);
    if (decoded) {
      return {
        type: 'blob',
        modality,
        mime_type: source.media_type ?? defaultMimeType,
        content: decoded,
      };
    }
  } else if ('bytes' in source) {
    return {
      type: 'blob',
      modality,
      mime_type: source.media_type ?? defaultMimeType,
      content: toBytes(source.bytes),
    };
  }
  return undefined;
}

function extractParts(content: unknown): MessagePart[] {
  if (typeof content === 'string') {
    return [{ type: 'text', content }];
  }
  if (!Array.isArray(content)) return [];
  const parts: MessagePart[] = [];
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push({ type: 'text', content: item });
    } else if (isRecord(item)) {
      const part = extractContentBlock(item);
      if (part) parts.push(part);
    }
  }
  return parts;
}

function extractSystemParts(content: unknown): SystemInstructionPart[] {
  if (typeof content === 'string') {
    return content ? [{ type: 'text', content }] : [];
  }
  if (!Array.isArray(content)) return [];
  const parts: SystemInstructionPart[] = [];
  for (const item of content) {
    if (typeof item === 'string' && item) {
      parts.push({ type: 'text', content: item });
    } else if (isRecord(item) && typeof item.text === 'string' && item.text) {
      parts.push({ type: 'text', content: item.text });
    }
  }
  return parts;
}

function extractInputMessages(
  messages: unknown,
  defaultRole: string
): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.filter(isRecord).map(msg => ({
    role: msg.role ?? defaultRole,
    parts: extractParts(msg.content),
  }));
}

function extractGuardrailAttributes(input: AnyRecord): Attributes {
  const guardrailId = firstDefined(
    input.guardrailIdentifier,
    isRecord(input.guardrailConfig)
      ? input.guardrailConfig.guardrailIdentifier
      : undefined
  );
  return guardrailId
    ? { [ATTR_AWS_BEDROCK_GUARDRAIL_ID]: String(guardrailId) }
    : {};
}

function toStringArray(val: unknown): string[] | undefined {
  return Array.isArray(val) ? val.map(s => String(s)) : undefined;
}

function headerValue(
  headers: Record<string, string> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value;
  }
  return undefined;
}

/**
 * Parse a request or response body (a JSON string or bytes) into an object.
 */
export function parseBody(body: unknown): AnyRecord | undefined {
  if (isRecord(body) && !(body instanceof Uint8Array)) return body;
  let text: string | undefined;
  if (typeof body === 'string') {
    text = body;
  } else if (body instanceof Uint8Array) {
    text = Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString(
      'utf-8'
    );
  }
  if (text === undefined) return undefined;
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Input tokens reported by Converse exclude cached tokens, while the semantic
 * conventions want `gen_ai.usage.input_tokens` to include them.
 */
export function totalInputTokens(
  inputTokens: number | undefined,
  cacheReadTokens: number | undefined,
  cacheWriteTokens: number | undefined
): number | undefined {
  if (
    inputTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined
  ) {
    return undefined;
  }
  return (inputTokens ?? 0) + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0);
}

/**
 * Data extracted from an inference request, used to start the invocation.
 */
export interface InferenceRequestData {
  requestOptions: InferenceRequestOptions;
  attributes: Attributes;
  inputMessages?: ChatMessage[];
  systemInstructions?: SystemInstructionPart[];
}

export function extractConverseRequest(
  input: AnyRecord,
  captureContent: boolean
): InferenceRequestData {
  const requestOptions: InferenceRequestOptions = {};
  const attributes: Attributes = extractGuardrailAttributes(input);

  const inferenceConfig = input.inferenceConfig;
  if (isRecord(inferenceConfig)) {
    requestOptions.temperature = toFloat(inferenceConfig.temperature);
    requestOptions.topP = toFloat(inferenceConfig.topP);
    requestOptions.maxTokens = toInt(inferenceConfig.maxTokens);
    requestOptions.stopSequences = toStringArray(inferenceConfig.stopSequences);
    requestOptions.topK = toInt(
      firstDefined(inferenceConfig.topK, inferenceConfig.top_k)
    );
    requestOptions.seed = toInt(inferenceConfig.seed);
  }

  const additionalFields = input.additionalModelRequestFields;
  if (isRecord(additionalFields)) {
    const additionalConfig = isRecord(additionalFields.inferenceConfig)
      ? additionalFields.inferenceConfig
      : {};
    requestOptions.topK = toInt(
      firstDefined(
        additionalFields.topK,
        additionalFields.top_k,
        additionalConfig.topK,
        additionalConfig.top_k,
        requestOptions.topK
      )
    );
    if (additionalFields.seed !== undefined) {
      requestOptions.seed = toInt(additionalFields.seed);
    }
  }

  const textFormat = isRecord(input.outputConfig)
    ? input.outputConfig.textFormat
    : undefined;
  if (textFormat) {
    const format = String(
      isRecord(textFormat) ? textFormat.type : textFormat
    ).toLowerCase();
    if (format === 'json' || format === 'text') {
      attributes[ATTR_GEN_AI_OUTPUT_TYPE] = format;
    }
  }

  const data: InferenceRequestData = { requestOptions, attributes };
  if (!captureContent) return data;

  if (isRecord(input.promptVariables)) {
    for (const [name, value] of Object.entries(input.promptVariables)) {
      if (isRecord(value) && value.text !== undefined) {
        attributes[`gen_ai.prompt.variable.${name}`] = String(value.text);
      }
    }
  }

  const systemParts = extractSystemParts(input.system);
  if (systemParts.length > 0) data.systemInstructions = systemParts;

  if (Array.isArray(input.messages)) {
    data.inputMessages = extractInputMessages(input.messages, 'user');
  }
  return data;
}

export function extractConverseResponse(
  output: AnyRecord | undefined,
  invocation: InferenceInvocation,
  captureContent: boolean
): void {
  if (!output) return;
  const finishReason = mapFinishReason(output.stopReason);
  if (finishReason) invocation.setFinishReasons([finishReason]);

  const message = isRecord(output.output) ? output.output.message : undefined;
  if (captureContent && isRecord(message)) {
    invocation.addOutputMessages([
      {
        role: message.role ?? 'assistant',
        parts: extractParts(message.content),
        finish_reason: finishReason ?? 'error',
      },
    ]);
  }

  const usage = output.usage;
  if (isRecord(usage)) {
    invocation.setUsage(
      converseUsage(
        toInt(usage.inputTokens),
        toInt(usage.outputTokens),
        toInt(usage.cacheReadInputTokens),
        toInt(usage.cacheWriteInputTokens)
      )
    );
  }
}

export function converseUsage(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  cacheReadTokens: number | undefined,
  cacheWriteTokens: number | undefined
): TokenUsageDetails {
  return {
    inputTokenCount: totalInputTokens(
      inputTokens,
      cacheReadTokens,
      cacheWriteTokens
    ),
    outputTokenCount: outputTokens,
    cacheReadTokenCount: cacheReadTokens,
    cacheWriteTokenCount: cacheWriteTokens,
  };
}

export function extractInvokeModelRequest(
  input: AnyRecord,
  captureContent: boolean
): InferenceRequestData {
  const requestOptions: InferenceRequestOptions = {};
  const attributes = extractGuardrailAttributes(input);
  const data: InferenceRequestData = { requestOptions, attributes };

  const body = parseBody(input.body);
  if (!body) return data;

  const textGenConfig = isRecord(body.textGenerationConfig)
    ? body.textGenerationConfig
    : {};
  const inferenceConfig = isRecord(body.inferenceConfig)
    ? body.inferenceConfig
    : {};

  requestOptions.temperature = toFloat(
    firstDefined(
      body.temperature,
      textGenConfig.temperature,
      inferenceConfig.temperature
    )
  );
  requestOptions.topP = toFloat(
    firstDefined(
      body.top_p,
      body.topP,
      body.p,
      textGenConfig.topP,
      inferenceConfig.top_p,
      inferenceConfig.topP
    )
  );
  requestOptions.topK = toInt(
    firstDefined(body.top_k, body.topK, body.k, inferenceConfig.top_k)
  );
  requestOptions.maxTokens = toInt(
    firstDefined(
      body.max_tokens,
      body.max_tokens_to_sample,
      body.max_gen_len,
      body.maxTokens,
      textGenConfig.maxTokenCount,
      inferenceConfig.max_new_tokens
    )
  );
  requestOptions.stopSequences = toStringArray(
    firstDefined(
      body.stop_sequences,
      body.stopSequences,
      body.stop,
      textGenConfig.stopSequences,
      inferenceConfig.stopSequences
    )
  );
  requestOptions.seed = toInt(body.seed);

  if (!captureContent) return data;

  const systemParts = extractSystemParts(body.system);
  if (systemParts.length > 0) data.systemInstructions = systemParts;

  if (Array.isArray(body.messages)) {
    const messages = extractInputMessages(body.messages, 'user');
    if (messages.length > 0) data.inputMessages = messages;
  } else {
    const prompt = [body.prompt, body.inputText, body.message].find(
      p => typeof p === 'string'
    );
    if (prompt !== undefined) {
      data.inputMessages = [
        { role: 'user', parts: [{ type: 'text', content: prompt }] },
      ];
    }
  }
  return data;
}

export function extractInvokeModelResponse(
  body: AnyRecord | undefined,
  headers: Record<string, string> | undefined,
  invocation: InferenceInvocation,
  captureContent: boolean
): void {
  // Token counts from response headers, falling back to the body payload.
  let inputTokens = toInt(
    headerValue(headers, 'x-amzn-bedrock-input-token-count')
  );
  let outputTokens = toInt(
    headerValue(headers, 'x-amzn-bedrock-output-token-count')
  );
  let cacheReadTokens: number | undefined;
  let cacheWriteTokens: number | undefined;

  if (!body) {
    invocation.setUsage({
      inputTokenCount: inputTokens,
      outputTokenCount: outputTokens,
    });
    return;
  }

  const usage = body.usage;
  if (isRecord(usage)) {
    inputTokens ??= toInt(firstDefined(usage.input_tokens, usage.inputTokens));
    outputTokens ??= toInt(
      firstDefined(usage.output_tokens, usage.outputTokens)
    );
    cacheReadTokens = toInt(
      firstDefined(usage.cache_read_input_tokens, usage.cacheReadInputTokens)
    );
    cacheWriteTokens = toInt(
      firstDefined(
        usage.cache_creation_input_tokens,
        usage.cacheWriteInputTokens
      )
    );
  }

  const firstResult =
    Array.isArray(body.results) && isRecord(body.results[0])
      ? body.results[0]
      : undefined;
  const firstOutput =
    Array.isArray(body.outputs) && isRecord(body.outputs[0])
      ? body.outputs[0]
      : undefined;
  const firstGeneration =
    Array.isArray(body.generations) && isRecord(body.generations[0])
      ? body.generations[0]
      : undefined;
  const firstCompletion =
    Array.isArray(body.completions) && isRecord(body.completions[0])
      ? body.completions[0]
      : undefined;

  inputTokens ??= toInt(body.inputTextTokenCount);
  outputTokens ??= toInt(firstResult?.tokenCount);
  inputTokens ??= toInt(body.prompt_token_count);
  outputTokens ??= toInt(body.generation_token_count);

  invocation.setUsage({
    inputTokenCount: inputTokens,
    outputTokenCount: outputTokens,
    cacheReadTokenCount: cacheReadTokens,
    cacheWriteTokenCount: cacheWriteTokens,
  });

  // Finish reasons
  let rawFinishReason: unknown;
  if (typeof body.stop_reason === 'string') {
    rawFinishReason = body.stop_reason;
  } else if (typeof body.stopReason === 'string') {
    rawFinishReason = body.stopReason;
  } else if (typeof body.finish_reason === 'string') {
    rawFinishReason = body.finish_reason;
  } else if (firstResult) {
    rawFinishReason = firstResult.completionReason;
  } else if (firstOutput) {
    rawFinishReason = firstOutput.stop_reason;
  } else if (firstGeneration) {
    rawFinishReason = firstGeneration.finish_reason;
  } else if (firstCompletion && isRecord(firstCompletion.finishReason)) {
    rawFinishReason = firstCompletion.finishReason.reason;
  }
  const finishReason = mapFinishReason(rawFinishReason);
  if (finishReason) invocation.setFinishReasons([finishReason]);

  if (typeof body.id === 'string') invocation.setResponseId(body.id);

  if (!captureContent) return;

  let output: OutputMessage | undefined;
  const textOutput = (text: unknown): OutputMessage => ({
    role: 'assistant',
    parts: [{ type: 'text', content: String(text) }],
  });
  if (Array.isArray(body.content)) {
    // Anthropic Messages format
    output = { role: body.role ?? 'assistant', parts: extractParts(body.content) };
  } else if (isRecord(body.output) && isRecord(body.output.message)) {
    // Amazon Nova format
    const message = body.output.message;
    output = {
      role: message.role ?? 'assistant',
      parts: extractParts(message.content),
    };
  } else if (typeof body.completion === 'string') {
    // Anthropic legacy completion
    output = textOutput(body.completion);
  } else if (firstResult && 'outputText' in firstResult) {
    // Amazon Titan
    output = textOutput(firstResult.outputText);
  } else if (typeof body.generation === 'string') {
    // Meta Llama
    output = textOutput(body.generation);
  } else if (firstOutput && 'text' in firstOutput) {
    // Mistral
    output = textOutput(firstOutput.text);
  } else if (firstGeneration && 'text' in firstGeneration) {
    // Cohere Command
    output = textOutput(firstGeneration.text);
  } else if (typeof body.text === 'string') {
    // Cohere Command R
    output = textOutput(body.text);
  } else if (
    firstCompletion &&
    isRecord(firstCompletion.data) &&
    'text' in firstCompletion.data
  ) {
    // AI21
    output = textOutput(firstCompletion.data.text);
  }

  if (output) {
    output.finish_reason = finishReason ?? 'error';
    invocation.addOutputMessages([output]);
  }
}

/**
 * Return whether the model ID corresponds to an embedding model.
 *
 * Every Bedrock embedding model ID contains `embed` (`amazon.titan-embed-*`,
 * `cohere.embed-*`, `twelvelabs.*-embed-*`), and no text generation model does.
 */
export function isEmbeddingModel(modelId: unknown): boolean {
  return typeof modelId === 'string' && modelId.toLowerCase().includes('embed');
}

/**
 * Data extracted from an embedding request, used to start the invocation.
 */
export interface EmbeddingRequestData {
  attributes: Attributes;
  dimensionCount?: number;
  encodingFormats?: string[];
}

export function extractEmbeddingRequest(
  input: AnyRecord
): EmbeddingRequestData {
  const data: EmbeddingRequestData = {
    attributes: extractGuardrailAttributes(input),
  };
  const body = parseBody(input.body);
  if (!body) return data;

  const embeddingConfig = isRecord(body.embeddingConfig)
    ? body.embeddingConfig
    : {};
  data.dimensionCount = toInt(
    firstDefined(body.dimensions, embeddingConfig.outputEmbeddingLength)
  );

  const rawFormats = firstDefined(
    body.embedding_types,
    body.embeddingTypes,
    body.encoding_format,
    body.encoding_formats
  );
  if (Array.isArray(rawFormats)) {
    const formats = rawFormats
      .filter(f => f !== undefined && f !== null)
      .map(f => String(f));
    if (formats.length > 0) data.encodingFormats = formats;
  } else if (typeof rawFormats === 'string' && rawFormats) {
    data.encodingFormats = [rawFormats];
  }
  return data;
}

export function extractEmbeddingResponse(
  body: AnyRecord | undefined,
  headers: Record<string, string> | undefined,
  invocation: EmbeddingInvocation
): void {
  let inputTokens = toInt(
    headerValue(headers, 'x-amzn-bedrock-input-token-count')
  );
  const responseModel = headerValue(headers, 'x-amzn-bedrock-model-id');
  if (responseModel) invocation.setResponseModel(responseModel);

  if (body) {
    if (inputTokens === undefined) {
      const billedUnits = isRecord(body.meta)
        ? body.meta.billed_units
        : undefined;
      inputTokens = toInt(
        firstDefined(
          body.inputTextTokenCount,
          isRecord(billedUnits) ? billedUnits.input_tokens : undefined
        )
      );
    }

    if (Array.isArray(body.embedding)) {
      invocation.setDimensionCount(body.embedding.length);
    } else if (Array.isArray(body.embeddings)) {
      if (Array.isArray(body.embeddings[0])) {
        invocation.setDimensionCount(body.embeddings[0].length);
      }
    } else if (isRecord(body.embeddings)) {
      for (const list of Object.values(body.embeddings)) {
        if (Array.isArray(list) && Array.isArray(list[0])) {
          invocation.setDimensionCount(list[0].length);
          break;
        }
      }
    }
  }

  if (inputTokens !== undefined) invocation.setUsage(inputTokens);
}
