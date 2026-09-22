/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseMessage } from '@langchain/core/messages';
import type { BasePromptValueInterface } from '@langchain/core/prompt_values';
import type { DiagLogger } from '@opentelemetry/api';
import {
  formatInputMessages,
  formatOutputMessages,
  formatSystemInstructions,
} from '@opentelemetry/genai-util';
import type {
  BlobPart,
  ChatMessage,
  InputMessages,
  MessagePart,
  OutputMessages,
  SystemInstructions,
} from '@opentelemetry/genai-util';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMessage(value: unknown): value is BaseMessage {
  return isRecord(value) && typeof value._getType === 'function';
}

function isPromptValue(
  value: unknown
): value is Pick<BasePromptValueInterface, 'toChatMessages'> {
  return isRecord(value) && typeof value.toChatMessages === 'function';
}

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
  } satisfies BlobPart;
}

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
        };
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

function normalizeParts(values: unknown[], diag: DiagLogger): MessagePart[] {
  return values
    .map(value => part(value, diag))
    .filter((value): value is MessagePart => value !== undefined);
}

function normalizeMessages(
  value: unknown,
  diag: DiagLogger,
  defaultRole: string
): ChatMessage[] | undefined {
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

  const result: ChatMessage[] = [];
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

function parseMessages(
  value: unknown,
  diag: DiagLogger,
  defaultRole: string
): ChatMessage[] | undefined {
  try {
    return normalizeMessages(value, diag, defaultRole);
  } catch {
    diag.debug('LangChain: failed to normalize messages');
    return undefined;
  }
}

export function parseInputMessages(
  value: unknown,
  diag: DiagLogger
): InputMessages | undefined {
  return parseMessages(value, diag, 'user');
}

export function parseOutputMessages(
  value: unknown,
  diag: DiagLogger
): OutputMessages | undefined {
  return parseMessages(value, diag, 'assistant');
}

export function messages(
  value: unknown,
  diag: DiagLogger,
  defaultRole = 'user'
): string | undefined {
  const parsed = parseMessages(value, diag, defaultRole);
  if (!parsed) return undefined;
  const formatted =
    defaultRole === 'assistant'
      ? formatOutputMessages(parsed)
      : formatInputMessages(parsed);
  if (formatted === undefined)
    diag.debug('LangChain: failed to serialize messages');
  return formatted;
}

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
  const formatted = formatOutputMessages(parsed);
  if (formatted === undefined)
    diag.debug('LangChain: failed to serialize batch output messages');
  return formatted;
}

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

export function parseSystemInstructions(
  value: unknown,
  diag: DiagLogger
): SystemInstructions | undefined {
  try {
    const content = isMessage(value) ? value.content : value;
    if (typeof content === 'string') return [{ type: 'text', content }];
    if (Array.isArray(content) && content.length) {
      const parts = normalizeParts(content, diag);
      return parts.length ? parts : undefined;
    }
    return undefined;
  } catch {
    diag.debug('LangChain: failed to normalize system instructions');
    return undefined;
  }
}

export function systemInstructions(
  value: unknown,
  diag: DiagLogger
): string | undefined {
  const parsed = parseSystemInstructions(value, diag);
  if (!parsed) return undefined;
  const formatted = formatSystemInstructions(parsed);
  if (formatted === undefined)
    diag.debug('LangChain: failed to serialize system instructions');
  return formatted;
}
