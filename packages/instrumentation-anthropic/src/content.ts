/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type Anthropic from '@anthropic-ai/sdk';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object';
}

function messagePart(block: unknown): JsonObject | undefined {
  if (!isObject(block) || typeof block.type !== 'string') return undefined;
  switch (block.type) {
    case 'text':
      return { type: 'text', content: block.text };
    case 'thinking':
    case 'redacted_thinking':
      return {
        type: 'reasoning',
        content: block.thinking ?? block.data,
      };
    case 'tool_use':
    case 'server_tool_use':
      return {
        type: 'tool_call',
        id: block.id,
        name: block.name,
        arguments: block.input,
      };
    case 'tool_result':
    case 'web_search_tool_result':
      return {
        type: 'tool_call_response',
        id: block.tool_use_id,
        response: block.content,
      };
    case 'image':
    case 'document':
      return { type: block.type, source: block.source };
    default:
      return { type: block.type };
  }
}

function contentParts(content: unknown): JsonObject[] {
  if (typeof content === 'string') {
    return [{ type: 'text', content }];
  }
  if (!Array.isArray(content)) return [];
  return content.flatMap(block => {
    const part = messagePart(block);
    return part ? [part] : [];
  });
}

export function serializeInputMessages(
  messages: Anthropic.Messages.MessageParam[]
): string | undefined {
  return safeJson(
    messages.map(message => ({
      role: message.role,
      parts: contentParts(message.content),
    }))
  );
}

export function serializeSystemInstructions(
  system: Anthropic.Messages.MessageCreateParams['system']
): string | undefined {
  return safeJson(contentParts(system));
}

export function normalizeFinishReason(
  reason: Anthropic.Messages.StopReason
): string {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
    default:
      return reason;
  }
}

export function serializeOutputMessage(
  message: Anthropic.Messages.Message
): string | undefined {
  return safeJson([
    {
      role: message.role,
      parts: contentParts(message.content),
      finish_reason: message.stop_reason
        ? normalizeFinishReason(message.stop_reason)
        : undefined,
    },
  ]);
}

export class StreamContentAccumulator {
  private readonly _parts = new Map<number, JsonObject>();
  private _finishReason: string | undefined;

  add(event: Anthropic.Messages.RawMessageStreamEvent): void {
    if (event.type === 'content_block_start') {
      const part = messagePart(event.content_block);
      if (part) this._parts.set(event.index, part);
      return;
    }
    if (event.type === 'content_block_delta') {
      const part = this._parts.get(event.index);
      if (!part) return;
      if (event.delta.type === 'text_delta') {
        part.content = `${part.content ?? ''}${event.delta.text}`;
      } else if (event.delta.type === 'thinking_delta') {
        part.content = `${part.content ?? ''}${event.delta.thinking}`;
      } else if (event.delta.type === 'input_json_delta') {
        part.partial_json = `${part.partial_json ?? ''}${event.delta.partial_json}`;
      }
      return;
    }
    if (event.type === 'message_delta' && event.delta.stop_reason) {
      this._finishReason = normalizeFinishReason(event.delta.stop_reason);
    }
  }

  serialize(): string | undefined {
    const parts = [...this._parts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, part]) => {
        const { partial_json: partialJson, ...result } = part;
        if (typeof partialJson === 'string') {
          try {
            result.arguments = JSON.parse(partialJson);
          } catch {
            result.arguments = partialJson;
          }
        }
        return result;
      });
    return safeJson([
      { role: 'assistant', parts, finish_reason: this._finishReason },
    ]);
  }
}

function safeJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
