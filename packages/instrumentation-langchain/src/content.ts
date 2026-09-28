/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseMessage } from '@langchain/core/messages';
import type { BasePromptValueInterface } from '@langchain/core/prompt_values';
import type { DiagLogger } from '@opentelemetry/api';

// LangChain also supplies provider-defined parts and malformed tool calls.
// Keep their fields without claiming a stronger SDK-independent schema.
interface MessagePart {
  type: string;
  [key: string]: unknown;
}

interface BlobPart extends MessagePart {
  type: 'blob';
  modality: string;
  content: Uint8Array;
  mime_type?: unknown;
}

interface Message {
  role: string;
  parts: MessagePart[];
}

/**
 * Serializes normalized GenAI messages to JSON, encoding binary content as
 * base64. Logs and returns undefined if serialization fails.
 */
function serializeMessages(
  value: Message[],
  diag: DiagLogger
): string | undefined {
  try {
    return JSON.stringify(
      value,
      function (
        this: Record<string, unknown>,
        key: string,
        serialized: unknown
      ) {
        // Read the original property because Buffer.toJSON runs before a replacer.
        const raw: unknown = this[key];
        return raw instanceof Uint8Array
          ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString(
              'base64'
            )
          : serialized;
      }
    );
  } catch {
    diag.debug('LangChain: failed to serialize messages');
    return undefined;
  }
}

/**
 * Narrows non-null, non-array objects for inspecting LangChain message fields.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Identifies LangChain messages by their _getType method without requiring a
 * runtime import of the SDK.
 */
function isMessage(value: unknown): value is BaseMessage {
  return isRecord(value) && typeof value._getType === 'function';
}

/**
 * Identifies LangChain prompt values that can produce a chat-message history.
 */
function isPromptValue(
  value: unknown
): value is Pick<BasePromptValueInterface, 'toChatMessages'> {
  return isRecord(value) && typeof value.toChatMessages === 'function';
}

/**
 * Validates standard base64 characters, optional padding, and unused trailing
 * bits in linear time and constant space, including for large binary payloads.
 */
function validBase64(value: string): boolean {
  let length = value.length;
  while (length > 0 && value.charCodeAt(length - 1) === 61) length--;
  const padding = value.length - length;
  const remainder = length % 4;
  if (
    padding > 2 ||
    remainder === 1 ||
    (padding > 0 && (value.length % 4 !== 0 || remainder !== 4 - padding))
  )
    return false;
  let last = 0;
  // A repeated-quartet regexp can exhaust V8's regexp stack for large images.
  // Scan once, with constant space, before using Buffer's permissive decoder.
  for (let index = 0; index < length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 65 && code <= 90) last = code - 65;
    else if (code >= 97 && code <= 122) last = code - 71;
    else if (code >= 48 && code <= 57) last = code + 4;
    else if (code === 43) last = 62;
    else if (code === 47) last = 63;
    else return false;
  }
  return remainder === 2
    ? (last & 15) === 0
    : remainder === 3
      ? (last & 3) === 0
      : true;
}

/**
 * Decodes validated base64 into binary content. Logs and returns undefined for
 * non-string or invalid input rather than using Buffer's permissive decoding.
 */
function decodeBase64(
  value: unknown,
  diag: DiagLogger
): Uint8Array | undefined {
  if (typeof value !== 'string' || !validBase64(value)) {
    diag.debug('LangChain: omitting invalid base64 content');
    return undefined;
  }
  return Buffer.from(value, 'base64');
}

/**
 * Converts an image URL to a GenAI URI part, or a base64 image data URL to a
 * binary blob part. Logs and omits malformed or unsupported data URLs.
 */
function imagePart(url: string, diag: DiagLogger): MessagePart | undefined {
  if (!/^data:/i.test(url)) {
    return { type: 'uri', modality: 'image', uri: url };
  }
  const match =
    /^data:(image\/[a-z0-9!#$&^_.+-]+)(?:;[a-z0-9!#$%&'*+.^_`|~-]+=[a-z0-9!#$%&'*+.^_`|~-]+)*;base64,(.*)$/i.exec(
      url
    );
  if (!match || match[0] !== url || /%(?![a-f0-9]{2})/i.test(url)) {
    diag.debug('LangChain: omitting invalid image data URL');
    return undefined;
  }
  let encoded: string;
  try {
    encoded = decodeURIComponent(match[2]);
  } catch {
    diag.debug('LangChain: omitting invalid image data URL');
    return undefined;
  }
  const content = decodeBase64(encoded, diag);
  if (content === undefined) return undefined;
  return {
    type: 'blob',
    modality: 'image',
    mime_type: match[1].toLowerCase(),
    content,
  };
}

/**
 * Maps a LangChain content block to a GenAI message part, preserving unmapped
 * provider-specific fields. Invalid binary content is logged and omitted.
 */
function part(value: unknown, diag: DiagLogger): MessagePart | undefined {
  if (!isRecord(value)) {
    return { type: 'text', content: String(value) };
  }
  switch (value.type) {
    case 'text':
      return { type: 'text', content: value.text };
    case 'reasoning':
    case 'thinking':
      return {
        type: 'reasoning',
        content: value.reasoning ?? value.thinking,
      };
    case 'image_url': {
      const url = isRecord(value.image_url)
        ? value.image_url.url
        : value.image_url;
      if (typeof url === 'string') return imagePart(url, diag);
      break;
    }
    case 'image':
    case 'audio':
    case 'video':
    case 'file':
      if (
        typeof value.file_id === 'string' ||
        typeof value.fileId === 'string'
      ) {
        return {
          type: 'file',
          modality: value.type === 'file' ? 'document' : value.type,
          file_id: value.file_id ?? value.fileId,
          ...(value.mime_type ? { mime_type: value.mime_type } : {}),
        };
      }
      if (typeof value.url === 'string') {
        if (value.type === 'image') {
          return imagePart(value.url, diag);
        }
        return {
          type: 'uri',
          modality: value.type === 'file' ? 'document' : value.type,
          uri: value.url,
        };
      }
      if ('base64' in value) {
        const content = decodeBase64(value.base64, diag);
        if (content === undefined) return undefined;
        return {
          type: 'blob',
          modality: value.type === 'file' ? 'document' : value.type,
          content,
          ...(value.mime_type ? { mime_type: value.mime_type } : {}),
        } satisfies BlobPart;
      }
      break;
    case 'blob':
      if (!(value.content instanceof Uint8Array)) {
        diag.debug('LangChain: omitting invalid binary blob content');
        return undefined;
      }
      return { ...value, type: 'blob', content: value.content };
    case 'tool_call':
      return {
        type: 'tool_call',
        id: value.id,
        name: value.name,
        arguments: value.args,
      };
    case 'server_tool_call':
      return {
        type: 'server_tool_call',
        id: value.id,
        name: value.name,
        server_tool_call: { ...value, type: value.name ?? value.type },
      };
    case 'server_tool_result':
    case 'server_tool_call_result':
      return {
        type: 'server_tool_call_response',
        id: value.toolCallId ?? value.tool_call_id,
        server_tool_call_response: { ...value, type: value.name ?? value.type },
      };
  }
  // The official schema allows provider-specific parts with their original type.
  diag.debug('LangChain: preserving an unmapped message part');
  return {
    ...value,
    type: typeof value.type === 'string' ? value.type : 'unknown',
  };
}

/**
 * Normalizes content blocks in order, excluding parts rejected as invalid.
 */
function normalizeParts(values: unknown[], diag: DiagLogger): MessagePart[] {
  return values
    .map(value => part(value, diag))
    .filter((value): value is MessagePart => value !== undefined);
}

/**
 * Converts LangChain strings, prompt values, messages, histories, and
 * input/output wrappers to GenAI messages. Normalizes roles and tool calls,
 * using defaultRole only for a standalone string and retaining binary content.
 * Returns undefined when no messages can be extracted; SDK methods may throw.
 */
function normalizeMessages(
  value: unknown,
  diag: DiagLogger,
  defaultRole: string
): Message[] | undefined {
  if (isRecord(value) && !isPromptValue(value)) {
    if ('messages' in value) value = value.messages;
    else if ('output' in value) value = value.output;
    else if ('input' in value) value = value.input;
  }
  if (isPromptValue(value)) value = value.toChatMessages();
  if (typeof value === 'string') {
    return [{ role: defaultRole, parts: [{ type: 'text', content: value }] }];
  }
  if (isMessage(value)) value = [value];
  if (!Array.isArray(value)) return undefined;

  const result: Message[] = [];
  for (const item of value) {
    let role: unknown;
    let content: unknown;
    let toolCalls: unknown;
    let toolCallId: unknown;
    let additional: unknown;
    let invalidToolCalls: unknown;
    if (typeof item === 'string') {
      role = 'user';
      content = item;
    } else if (isMessage(item)) {
      role = item._getType();
      content = item.content;
      additional = item.additional_kwargs;
      if ('tool_calls' in item) toolCalls = item.tool_calls;
      if ('tool_call_id' in item) toolCallId = item.tool_call_id;
      if ('invalid_tool_calls' in item)
        invalidToolCalls = item.invalid_tool_calls;
    } else if (Array.isArray(item) && item.length === 2) {
      [role, content] = item;
    } else if (isRecord(item)) {
      role = item.role ?? item.type;
      content = item.content;
      toolCalls = item.tool_calls;
      toolCallId = item.tool_call_id;
      additional = item.additional_kwargs;
      invalidToolCalls = item.invalid_tool_calls;
    } else {
      diag.debug('LangChain: skipping a value that is not a message');
      continue;
    }
    if (typeof role !== 'string') {
      diag.debug('LangChain: message has no role');
      continue;
    }
    const normalizedRole =
      role === 'human' ? 'user' : role === 'ai' ? 'assistant' : role;
    const parts: MessagePart[] =
      normalizedRole === 'tool'
        ? [{ type: 'tool_call_response', id: toolCallId, response: content }]
        : typeof content === 'string'
          ? [{ type: 'text', content }]
          : Array.isArray(content)
            ? normalizeParts(content, diag)
            : [];
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      for (const call of toolCalls) {
        if (isRecord(call)) {
          if (
            typeof call.id === 'string' &&
            parts.some(
              p => p.type === 'tool_call' && 'id' in p && p.id === call.id
            )
          )
            continue;
          parts.push(toolCallPart(call, diag));
        }
      }
    } else if (isRecord(additional)) {
      const calls = Array.isArray(additional.tool_calls)
        ? additional.tool_calls
        : additional.function_call
          ? [{ function: additional.function_call }]
          : [];
      for (const call of calls) {
        if (isRecord(call) && isRecord(call.function)) {
          parts.push(toolCallPart(call, diag));
        }
      }
    }
    if (Array.isArray(invalidToolCalls)) {
      for (const call of invalidToolCalls) {
        if (isRecord(call)) parts.push({ ...call, type: 'invalid_tool_call' });
      }
    }
    result.push({ role: normalizedRole, parts });
  }
  return result.length ? result : undefined;
}

/**
 * Guards message normalization so SDK or content errors are logged and return
 * undefined instead of escaping into the instrumented application.
 */
function parseMessages(
  value: unknown,
  diag: DiagLogger,
  defaultRole: string
): Message[] | undefined {
  try {
    return normalizeMessages(value, diag, defaultRole);
  } catch {
    diag.debug('LangChain: failed to normalize messages');
    return undefined;
  }
}

/**
 * Parses invocation input into structured GenAI messages, assigning standalone
 * strings the user role. Returns undefined if normalization fails or is empty.
 */
export function parseInputMessages(
  value: unknown,
  diag: DiagLogger
): Message[] | undefined {
  return parseMessages(value, diag, 'user');
}

/**
 * Parses invocation output into structured GenAI messages, assigning standalone
 * strings the assistant role. Explicit message roles remain unchanged apart
 * from human/ai aliases; failed or empty normalization returns undefined.
 */
export function parseOutputMessages(
  value: unknown,
  diag: DiagLogger
): Message[] | undefined {
  return parseMessages(value, diag, 'assistant');
}

/**
 * Produces JSON for a GenAI input/output messages attribute, assigning
 * standalone strings defaultRole. Returns undefined if parsing or
 * serialization fails or no messages are found.
 */
export function messages(
  value: unknown,
  diag: DiagLogger,
  defaultRole = 'user'
): string | undefined {
  const parsed = parseMessages(value, diag, defaultRole);
  if (!parsed) return undefined;
  return serializeMessages(parsed, diag);
}

/**
 * Serializes batch results as one GenAI output-message array, parsing each
 * result independently rather than treating the batch as a conversation.
 * Unparseable results are skipped; non-array input or serialization errors
 * are logged and return undefined.
 */
export function batchOutputMessages(
  value: unknown,
  diag: DiagLogger
): string | undefined {
  if (!Array.isArray(value)) {
    diag.debug('LangChain: cannot normalize non-array batch output');
    return undefined;
  }
  // The outer array is a batch, not a conversation. Each individual result
  // still follows LangChain's message/history semantics, including explicit roles.
  const parsed = value.flatMap(result => {
    const output =
      isRecord(result) && typeof result.role === 'string' ? [result] : result;
    return parseOutputMessages(output, diag) ?? [];
  });
  return serializeMessages(parsed, diag);
}

/**
 * Converts LangChain or provider function-call metadata to a GenAI tool-call
 * part. Parses JSON arguments when possible, logging and retaining the original
 * string when they are not valid JSON.
 */
function toolCallPart(
  call: Record<string, unknown>,
  diag: DiagLogger
): MessagePart {
  const fn = isRecord(call.function) ? call.function : call;
  let args = fn.arguments ?? fn.args;
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      diag.debug('LangChain: function call arguments are not JSON');
    }
  }
  return { type: 'tool_call', id: call.id, name: fn.name, arguments: args };
}
