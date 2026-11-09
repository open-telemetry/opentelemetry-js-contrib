/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { diag, type Attributes, type DiagLogger } from '@opentelemetry/api';
import {
  GEN_AI_FINISH_REASON_VALUE_ERROR,
  GEN_AI_FINISH_REASON_VALUE_TOOL_CALL,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
  GEN_AI_OUTPUT_TYPE_VALUE_TEXT,
  type BlobPart,
  type ChatMessage,
  type ContentCaptureMode,
  type FilePart,
  type FinishReason,
  type GenericPart,
  type InferenceInvocation,
  type InputMessages,
  type MessagePart,
  type Modality,
  type OutputMessage,
  type OutputMessages,
  type TokenUsageByModality,
  type TokenUsageDetails,
  type ToolCallRequestPart,
  type ToolCallResponsePart,
  type UriPart,
} from '@opentelemetry/genai-util';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionContentPartRefusal,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';
import type { CompletionUsage } from 'openai/resources/completions';
import type { ResponseUsage } from 'openai/resources/responses/responses';

/**
 * Read a boolean from an environment variable.
 *
 * https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/#boolean
 *
 * @param {string} name
 * @returns {boolean | undefined}
 *    - Returns `undefined` if the envvar is not set on `process.env` or is
 *      the empty string. This indicates that no explicit value was given,
 *      which may be a useful distinction from an explicit `false` for callers.
 *    - Returns `true` iff the envvar value is the string "true" (case-insensitive).
 *    - Returns `false`, iff the envvar value is the string "false" (case-insensitive).
 *    - Otherwise, it `diag.warn()`s about the invalid value and returns
 *      `undefined` as a (falsey) fallback.
 * @throws if the envvar value is set and is not a string
 */
export function getEnvBool(
  name: string,
  diag_: DiagLogger = diag
): boolean | undefined {
  const val = process.env[name];
  if (val === undefined || val === '') {
    return undefined;
  } else if (typeof val !== 'string') {
    throw new Error(
      `invalid type for environment variable: ${typeof val} (${name}=${val})`
    );
  } else {
    const valLower = val.toLowerCase();
    if (valLower === 'true') {
      return true;
    } else if (valLower === 'false') {
      return false;
    } else {
      diag_.warn(
        `invalid boolean value for environment variable: ${name}=${val}; ignoring`
      );
      return undefined;
    }
  }
}

const SERVER_PORT_FROM_URL_PROTOCOL: Record<string, number> = {
  'https:': 443,
  'http:': 80,
};

/**
 * Parse `serverAddress` and `serverPort` from an OpenAI client `baseURL`.
 */
export function parseBaseURL(
  baseURL: string | undefined,
  diag_: DiagLogger = diag
): { serverAddress?: string; serverPort?: number } {
  if (!baseURL) {
    return {};
  }

  let u: URL;
  try {
    u = new URL(baseURL);
  } catch (ex) {
    // Note: We should never get to this point as openai should crash prior to this.
    // Even if it did, instrumentation will still work except lacking these attributes.
    diag_.debug(
      `could not determine server.{address,port} from baseURL: ${ex}`
    );
    return {};
  }

  if (!u.hostname) {
    return {};
  }

  return {
    serverAddress: u.hostname,
    serverPort: u.port
      ? Number(u.port)
      : SERVER_PORT_FROM_URL_PROTOCOL[u.protocol],
  };
}

/**
 * Return span/metric attributes from the given OpenAI client baseURL.
 */
export function getAttrsFromBaseURL(
  baseURL: string | undefined,
  diag_: DiagLogger = diag
): Attributes | undefined {
  const { serverAddress, serverPort } = parseBaseURL(baseURL, diag_);
  if (!serverAddress) {
    return undefined;
  }

  const attrs: Attributes = {
    [ATTR_SERVER_ADDRESS]: serverAddress,
  };
  if (serverPort !== undefined) {
    attrs[ATTR_SERVER_PORT] = serverPort;
  }
  return attrs;
}

/**
 * Normalize an `OpenAIInstrumentationConfig['captureMessageContent']` value or
 * `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` environment variable
 * string into a `ContentCaptureMode` (`'none' | 'span_only'`), warning on
 * unrecognized values.
 */
export function resolveCaptureMode(
  value: unknown,
  diag_: DiagLogger = diag
): ContentCaptureMode {
  if (value === undefined || value === null || value === false) {
    return 'none';
  }
  if (value === true) {
    return 'span_only';
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
      case '':
      case 'none':
      case 'no_content':
      case 'false':
        return 'none';
      case 'span_only':
      case 'span':
      case 'true':
        return 'span_only';
      default:
        diag_.warn('OpenAI: invalid captureMessageContent mode; using none');
        return 'none';
    }
  }
  diag_.warn('OpenAI: invalid captureMessageContent mode; using none');
  return 'none';
}

/**
 * Derive a low-cardinality `error.type` string from an OpenAI SDK error or
 * arbitrary thrown value.
 *
 * OpenAI's `APIError` and `APIConnectionError` subclasses leave `error.name` as
 * `'Error'` while exposing specific subclass names on `error.constructor.name`
 * (e.g. `'APIConnectionError'`, `'RateLimitError'`, `'AuthenticationError'`)
 * and API-specific error codes on `error.code`. Preferring the subclass
 * constructor name keeps `error.type` low-cardinality and consistent across
 * network and HTTP API failures.
 */
export function getOpenAIErrorType(error: unknown): string {
  if (error instanceof Error) {
    const ctorName = error.constructor?.name;
    if (ctorName && ctorName !== 'Error' && ctorName !== 'Object') {
      return ctorName;
    }
    if (error.name && error.name !== 'Error') {
      return error.name;
    }
    if (
      'code' in error &&
      error.code != null &&
      String(error.code).trim().length > 0
    ) {
      return String(error.code);
    }
    return error.name || 'Error';
  }
  return '_OTHER';
}

/**
 * Map an OpenAI `response_format` or `text.format` specification to a
 * standardized `gen_ai.output.type` value.
 */
export function responseFormatToOutputType(
  format: { type?: string } | null | undefined
): string | undefined {
  const formatType = format?.type;
  if (!formatType) {
    return undefined;
  }
  switch (formatType) {
    case 'json_object':
    case 'json_schema':
      return GEN_AI_OUTPUT_TYPE_VALUE_JSON;
    case 'text':
      return GEN_AI_OUTPUT_TYPE_VALUE_TEXT;
    default:
      return formatType;
  }
}

/**
 * Parse a JSON-encoded tool argument or output string when valid JSON,
 * otherwise preserve the raw string.
 */
export function parseJsonArguments(raw: string | undefined | null): unknown {
  if (raw == null || raw === '') {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Decode a base64 string into a `Uint8Array`.
 */
export function decodeBase64(base64Data: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64Data, 'base64'));
}

/**
 * Convert a URL or `data:` URI into a `UriPart` or `BlobPart`.
 */
export function parseUriOrBlobPart(
  url: string,
  modality: Modality
): BlobPart | UriPart {
  if (url.startsWith('data:')) {
    const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s.exec(url);
    if (match) {
      const [, mimeType, b64] = match;
      return {
        type: 'blob',
        modality,
        ...(mimeType ? { mime_type: mimeType } : {}),
        content: decodeBase64(b64),
      };
    }
  }
  return {
    type: 'uri',
    modality,
    uri: url,
  };
}

/**
 * Infer embedding vector dimensionality from either a float array or a
 * base64-encoded IEEE-754 float32 buffer (`4` bytes per dimension).
 */
export function inferEmbeddingDimensions(
  embedding: number[] | string | undefined
): number | undefined {
  if (Array.isArray(embedding)) {
    return embedding.length > 0 ? embedding.length : undefined;
  }
  if (typeof embedding === 'string' && embedding.length > 0) {
    const byteLength = Buffer.byteLength(embedding, 'base64');
    const dims = Math.floor(byteLength / 4);
    return dims > 0 ? dims : undefined;
  }
  return undefined;
}

/**
 * Map OpenAI Chat Completions `CompletionUsage` into `genai-util`'s
 * `TokenUsageDetails`, including cache-read, reasoning, and audio modality
 * breakdowns when reported (`> 0`).
 */
export function extractChatTokenUsage(
  usage: CompletionUsage | null | undefined
): TokenUsageDetails | undefined {
  if (!usage) {
    return undefined;
  }

  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens;
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens;
  const promptAudioTokens = usage.prompt_tokens_details?.audio_tokens;
  const completionAudioTokens = usage.completion_tokens_details?.audio_tokens;

  const modalityUsage: TokenUsageByModality = {};
  let hasModalityUsage = false;

  if (promptAudioTokens !== undefined && promptAudioTokens > 0) {
    modalityUsage.inputTokens = { audio: promptAudioTokens };
    hasModalityUsage = true;
  }
  if (completionAudioTokens !== undefined && completionAudioTokens > 0) {
    modalityUsage.outputTokens = { audio: completionAudioTokens };
    hasModalityUsage = true;
  }

  return {
    inputTokenCount: usage.prompt_tokens,
    outputTokenCount: usage.completion_tokens,
    reasoningTokenCount:
      reasoningTokens !== undefined && reasoningTokens > 0
        ? reasoningTokens
        : undefined,
    cacheReadTokenCount:
      cachedTokens !== undefined && cachedTokens > 0 ? cachedTokens : undefined,
    tokenUsageByModality: hasModalityUsage ? modalityUsage : undefined,
  };
}

/**
 * Map OpenAI Responses API `ResponseUsage` into `genai-util`'s
 * `TokenUsageDetails`.
 */
export function extractResponsesTokenUsage(
  usage: ResponseUsage | null | undefined
): TokenUsageDetails | undefined {
  if (!usage) {
    return undefined;
  }

  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens;
  const cachedTokens = usage.input_tokens_details?.cached_tokens;
  const cacheWriteTokens = usage.input_tokens_details?.cache_write_tokens;

  return {
    inputTokenCount: usage.input_tokens,
    outputTokenCount: usage.output_tokens,
    reasoningTokenCount:
      reasoningTokens !== undefined && reasoningTokens > 0
        ? reasoningTokens
        : undefined,
    cacheReadTokenCount:
      cachedTokens !== undefined && cachedTokens > 0 ? cachedTokens : undefined,
    cacheWriteTokenCount:
      cacheWriteTokens !== undefined && cacheWriteTokens > 0
        ? cacheWriteTokens
        : undefined,
  };
}

function chatContentToParts(
  content:
    | string
    | ReadonlyArray<
        ChatCompletionContentPart | ChatCompletionContentPartRefusal
      >
    | null
    | undefined
): MessagePart[] {
  if (!content) {
    return [];
  }
  if (typeof content === 'string') {
    return [{ type: 'text', content }];
  }
  if (!Array.isArray(content)) {
    return [];
  }

  const parts: MessagePart[] = [];
  for (const part of content) {
    switch (part.type) {
      case 'text':
        parts.push({ type: 'text', content: part.text });
        break;
      case 'refusal':
        parts.push({ type: 'refusal', refusal: part.refusal } as GenericPart);
        break;
      case 'image_url':
        if (part.image_url?.url) {
          parts.push(parseUriOrBlobPart(part.image_url.url, 'image'));
        }
        break;
      case 'input_audio':
        if (part.input_audio?.data) {
          parts.push({
            type: 'blob',
            modality: 'audio',
            ...(part.input_audio.format
              ? { mime_type: `audio/${part.input_audio.format}` }
              : {}),
            content: decodeBase64(part.input_audio.data),
          } satisfies BlobPart);
        }
        break;
      case 'file':
        if (part.file?.file_id) {
          parts.push({
            type: 'file',
            modality: 'document',
            file_id: part.file.file_id,
          } satisfies FilePart);
        } else if (part.file?.file_data) {
          parts.push(parseUriOrBlobPart(part.file.file_data, 'document'));
        }
        break;
      default: {
        const generic = part as unknown as Record<string, unknown>;
        parts.push({
          ...generic,
          type: typeof generic.type === 'string' ? generic.type : 'unknown',
        });
        break;
      }
    }
  }
  return parts;
}

function mapChatToolCalls(
  toolCalls: ReadonlyArray<ChatCompletionMessageToolCall> | undefined
): ToolCallRequestPart[] {
  if (!toolCalls || toolCalls.length === 0) {
    return [];
  }
  return toolCalls.map((tc): ToolCallRequestPart => {
    if (tc.type === 'function') {
      return {
        type: 'tool_call',
        id: tc.id,
        name: tc.function.name,
        arguments: parseJsonArguments(tc.function.arguments),
      };
    }
    const custom = tc as unknown as {
      id?: string;
      type?: string;
      custom?: { name?: string; input?: unknown };
    };
    return {
      type: 'tool_call',
      id: custom.id,
      name: custom.custom?.name ?? custom.type ?? 'custom',
      arguments: custom.custom?.input,
    };
  });
}

/**
 * Convert OpenAI Chat Completions input `messages` to `genai-util`
 * `InputMessages`.
 */
export function extractChatInputMessages(
  messages: ReadonlyArray<ChatCompletionMessageParam>
): InputMessages {
  const result: ChatMessage[] = [];
  for (const msg of messages) {
    const parts: MessagePart[] = [];
    if (msg.role === 'assistant') {
      parts.push(
        ...chatContentToParts(
          msg.content as
            | string
            | ReadonlyArray<
                ChatCompletionContentPart | ChatCompletionContentPartRefusal
              >
            | null
            | undefined
        )
      );
      if (typeof msg.refusal === 'string' && msg.refusal.length > 0) {
        parts.push({ type: 'refusal', refusal: msg.refusal } as GenericPart);
      }
      parts.push(...mapChatToolCalls(msg.tool_calls));
      if (msg.function_call) {
        parts.push({
          type: 'tool_call',
          name: msg.function_call.name,
          arguments: parseJsonArguments(msg.function_call.arguments),
        } satisfies ToolCallRequestPart);
      }
    } else if (msg.role === 'tool') {
      const text =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content.map(p => p.text).join('')
            : '';
      parts.push({
        type: 'tool_call_response',
        id: msg.tool_call_id,
        response: parseJsonArguments(text) ?? text,
      } satisfies ToolCallResponsePart);
    } else if (msg.role === 'function') {
      const text = msg.content ?? '';
      parts.push({
        type: 'tool_call_response',
        response: parseJsonArguments(text) ?? text,
      } satisfies ToolCallResponsePart);
    } else {
      parts.push(
        ...chatContentToParts(
          msg.content as
            | string
            | ReadonlyArray<ChatCompletionContentPart>
            | null
            | undefined
        )
      );
    }

    const chatMsg: ChatMessage = {
      role: msg.role,
      parts,
    };
    if ('name' in msg && typeof msg.name === 'string' && msg.name.length > 0) {
      chatMsg.name = msg.name;
    }
    result.push(chatMsg);
  }
  return result;
}

/**
 * Normalize an OpenAI choice `finish_reason` for `OutputMessage.finish_reason`.
 */
export function normalizeChatFinishReason(
  reason: string | null | undefined
): FinishReason {
  if (reason === 'tool_calls' || reason === 'function_call') {
    return GEN_AI_FINISH_REASON_VALUE_TOOL_CALL;
  }
  if (reason && reason.length > 0) {
    return reason;
  }
  return GEN_AI_FINISH_REASON_VALUE_ERROR;
}

/**
 * Convert OpenAI Chat Completions response `choices` to `genai-util`
 * `OutputMessages`.
 */
export function extractChatOutputMessages(
  choices: ReadonlyArray<ChatCompletion.Choice>
): OutputMessages {
  return choices.map((choice): OutputMessage => {
    const parts: MessagePart[] = [];
    if (choice.message) {
      if (choice.message.content) {
        parts.push({ type: 'text', content: choice.message.content });
      }
      if (choice.message.refusal) {
        parts.push({
          type: 'refusal',
          refusal: choice.message.refusal,
        } as GenericPart);
      }
      parts.push(...mapChatToolCalls(choice.message.tool_calls));
      if (choice.message.function_call) {
        parts.push({
          type: 'tool_call',
          name: choice.message.function_call.name,
          arguments: parseJsonArguments(choice.message.function_call.arguments),
        } satisfies ToolCallRequestPart);
      }
    }
    return {
      role: choice.message?.role ?? 'assistant',
      parts,
      finish_reason: normalizeChatFinishReason(choice.finish_reason),
    };
  });
}

interface StreamToolCallBuffer {
  id?: string;
  name?: string;
  args: string[];
}

interface StreamChoiceBuffer {
  finishReason?: string;
  text: string[];
  refusal: string[];
  toolCalls: Array<StreamToolCallBuffer | undefined>;
}

/**
 * Accumulates streamed `ChatCompletionChunk` deltas across multiple choices and
 * multiple concurrent tool calls, updating an `InferenceInvocation`.
 */
export class ChatStreamAccumulator {
  private readonly _captureContent: boolean;
  private readonly _choices: Array<StreamChoiceBuffer | undefined> = [];
  private _responseIdSet = false;
  private _responseModelSet = false;

  constructor(captureContent: boolean) {
    this._captureContent = captureContent;
  }

  public onChunk(
    chunk: ChatCompletionChunk,
    invocation: InferenceInvocation
  ): void {
    if (!this._responseIdSet && chunk.id) {
      this._responseIdSet = true;
      invocation.setResponseId(chunk.id);
    }
    // Set response model before recordStreamChunk() executes so TTFT and
    // per-chunk metrics include `gen_ai.response.model`.
    if (!this._responseModelSet && chunk.model) {
      this._responseModelSet = true;
      invocation.setResponseModel(chunk.model);
    }
    if (chunk.usage) {
      const usage = extractChatTokenUsage(chunk.usage);
      if (usage) {
        invocation.setUsage(usage);
      }
    }

    for (const choice of chunk.choices ?? []) {
      const idx = choice.index ?? 0;
      const buf = (this._choices[idx] ??= {
        text: [],
        refusal: [],
        toolCalls: [],
      });

      if (choice.finish_reason) {
        buf.finishReason = choice.finish_reason;
      }

      if (!this._captureContent || !choice.delta) {
        continue;
      }

      if (choice.delta.content) {
        buf.text.push(choice.delta.content);
      }
      if (choice.delta.refusal) {
        buf.refusal.push(choice.delta.refusal);
      }

      for (const tc of choice.delta.tool_calls ?? []) {
        const tcIndex = tc.index ?? 0;
        const tcBuf = (buf.toolCalls[tcIndex] ??= {
          id: tc.id,
          name: tc.function?.name,
          args: [],
        });
        if (tc.id && !tcBuf.id) {
          tcBuf.id = tc.id;
        }
        if (tc.function?.name && !tcBuf.name) {
          tcBuf.name = tc.function.name;
        }
        if (tc.function?.arguments) {
          tcBuf.args.push(tc.function.arguments);
        }
      }
    }
  }

  public finalize(invocation: InferenceInvocation): void {
    if (this._choices.length > 0) {
      invocation.setFinishReasons(
        this._choices.map(choice => choice?.finishReason ?? '')
      );
    }

    if (!this._captureContent || this._choices.length === 0) {
      return;
    }

    const outputMessages: OutputMessage[] = [];
    for (const buf of this._choices) {
      if (!buf) {
        continue;
      }
      const parts: MessagePart[] = [];
      if (buf.text.length > 0) {
        parts.push({ type: 'text', content: buf.text.join('') });
      }
      if (buf.refusal.length > 0) {
        parts.push({
          type: 'refusal',
          refusal: buf.refusal.join(''),
        } as GenericPart);
      }
      for (const tc of buf.toolCalls) {
        if (!tc) {
          continue;
        }
        parts.push({
          type: 'tool_call',
          ...(tc.id ? { id: tc.id } : {}),
          name: tc.name ?? '',
          arguments: parseJsonArguments(tc.args.join('')),
        } satisfies ToolCallRequestPart);
      }
      outputMessages.push({
        role: 'assistant',
        parts,
        finish_reason: normalizeChatFinishReason(buf.finishReason),
      });
    }

    if (outputMessages.length > 0) {
      invocation.addOutputMessages(outputMessages);
    }
  }
}
