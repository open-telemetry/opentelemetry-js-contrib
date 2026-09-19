/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseMessage } from '@langchain/core/messages';
import type { BasePromptValueInterface } from '@langchain/core/prompt_values';
import type { DiagLogger } from '@opentelemetry/api';

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

/**
 * Tool content schemas require objects. Retain scalar/array results under a
 * content member rather than emitting JSON that violates the schema.
 */
export function toolContent(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      // Plain text is a supported LangChain tool input/output.
    }
  }
  return JSON.stringify(isRecord(value) ? value : { content: value });
}

function imagePart(url: unknown): Record<string, unknown> | undefined {
  if (typeof url !== 'string') return undefined;
  if (!/^data:/i.test(url)) {
    return { type: 'uri', modality: 'image', uri: url };
  }
  const match =
    /^data:(image\/[a-z0-9!#$&^_.+-]+)(?:;[a-z0-9!#$%&'*+.^_`|~-]+=[a-z0-9!#$%&'*+.^_`|~-]+)*;base64,(.*)$/i.exec(
      url
    );
  if (!match || match[0] !== url || /%(?![a-f0-9]{2})/i.test(url))
    return undefined;
  let content: string;
  try {
    content = decodeURIComponent(match[2]);
  } catch {
    return undefined;
  }
  if (
    content.trim() !== content ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?)?$/.test(
      content
    )
  )
    return undefined;
  return {
    type: 'blob',
    modality: 'image',
    mime_type: match[1].toLowerCase(),
    content,
  };
}

function part(value: unknown, diag: DiagLogger): Record<string, unknown> {
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
      const image = imagePart(
        isRecord(value.image_url) ? value.image_url.url : value.image_url
      );
      if (image) return image;
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
          const image = imagePart(value.url);
          if (image) return image;
          break;
        }
        return {
          type: 'uri',
          modality: value.type === 'file' ? 'document' : value.type,
          uri: value.url,
        };
      }
      if (typeof value.base64 === 'string') {
        return {
          type: 'blob',
          modality: value.type === 'file' ? 'document' : value.type,
          content: value.base64,
          ...(value.mime_type ? { mime_type: value.mime_type } : {}),
        };
      }
      break;
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

export function messages(
  value: unknown,
  diag: DiagLogger,
  defaultRole = 'user'
): string | undefined {
  if (isRecord(value) && !isPromptValue(value)) {
    if ('messages' in value) value = value.messages;
    else if ('output' in value) value = value.output;
    else if ('input' in value) value = value.input;
  }
  if (isPromptValue(value)) value = value.toChatMessages();
  if (typeof value === 'string') {
    return JSON.stringify([
      { role: defaultRole, parts: [{ type: 'text', content: value }] },
    ]);
  }
  if (isMessage(value)) value = [value];
  if (!Array.isArray(value)) return undefined;

  const result: Record<string, unknown>[] = [];
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
    role = role === 'human' ? 'user' : role === 'ai' ? 'assistant' : role;
    const parts =
      role === 'tool'
        ? [{ type: 'tool_call_response', id: toolCallId, response: content }]
        : typeof content === 'string'
          ? [{ type: 'text', content }]
          : Array.isArray(content)
            ? content.map(p => part(p, diag))
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
    result.push({ role, parts });
  }
  return result.length ? JSON.stringify(result) : undefined;
}

function toolCallPart(
  call: Record<string, unknown>,
  diag: DiagLogger
): Record<string, unknown> {
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

export function agentOutput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (Array.isArray(value.messages)) return value.messages.slice(-1);
  // Agent streaming defaults to graph updates, keyed by the node name.
  let output: unknown;
  for (const update of Object.values(value)) {
    if (
      isRecord(update) &&
      Array.isArray(update.messages) &&
      update.messages.length > 0
    ) {
      output = update.messages.slice(-1);
    }
  }
  return output;
}

export function systemInstructions(
  value: unknown,
  diag: DiagLogger
): string | undefined {
  const content = isMessage(value) ? value.content : value;
  if (typeof content === 'string')
    return JSON.stringify([{ type: 'text', content }]);
  if (Array.isArray(content))
    return JSON.stringify(content.map(item => part(item, diag)));
  return undefined;
}
