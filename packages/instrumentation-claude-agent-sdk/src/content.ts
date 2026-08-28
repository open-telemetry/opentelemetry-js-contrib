/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes, DiagLogger } from '@opentelemetry/api';

import type {
  Options,
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
} from './internal-types';
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
} from './semconv';

interface MessagePart {
  type: string;
  [key: string]: unknown;
}

interface GenAIMessage {
  role: string;
  parts: MessagePart[];
  finish_reason?: string;
}

interface CapturedOutput {
  id?: string;
  message: GenAIMessage;
  partial: boolean;
}

interface PartialOutput {
  id: string;
  blocks: unknown[];
  finishReason?: string;
}

export class ContentCapture {
  private readonly _inputMessages: GenAIMessage[] = [];
  private readonly _outputMessages: CapturedOutput[] = [];
  private readonly _outputIndexes = new Map<string, number>();
  private _partialOutput?: PartialOutput;
  private _turnOutputStart = 0;

  constructor(
    prompt: string | AsyncIterable<SDKUserMessage>,
    private readonly _diag: DiagLogger
  ) {
    if (typeof prompt === 'string') {
      this._appendInput({
        role: 'user',
        parts: [{ type: 'text', content: prompt }],
      });
    }
  }

  wrapPrompt(
    prompt: string | AsyncIterable<SDKUserMessage>
  ): string | AsyncIterable<SDKUserMessage> {
    if (typeof prompt === 'string') {
      return prompt;
    }

    const capture = this;
    return {
      async *[Symbol.asyncIterator]() {
        for await (const message of prompt) {
          capture.recordUserMessage(message);
          yield message;
        }
      },
    };
  }

  recordMessage(message: SDKMessage): void {
    try {
      if (message.type === 'assistant') {
        if (message.parent_tool_use_id === null) {
          this._recordAssistantMessage(message);
        }
      } else if (message.type === 'user') {
        if (message.parent_tool_use_id === null) {
          this.recordUserMessage(message);
        }
      } else if (message.type === 'stream_event') {
        if (message.parent_tool_use_id === null) {
          this._recordPartialMessage(message);
        }
      } else if (message.type === 'result') {
        this._recordResult(message);
      }
    } catch (error) {
      this._diag.debug('failed to capture Claude Agent SDK message', error);
    }
  }

  recordUserMessage(message: SDKUserMessage): void {
    const content = message.message.content;
    const parts =
      typeof content === 'string'
        ? [{ type: 'text', content }]
        : content.map(mapContentBlock);
    const role =
      parts.length > 0 &&
      parts.every(part => part.type === 'tool_call_response')
        ? 'tool'
        : message.message.role;
    this._appendInput({ role, parts });
  }

  getAttributes(options?: Options): Attributes {
    const attributes: Attributes = {};
    if (this._inputMessages.length > 0) {
      attributes[ATTR_GEN_AI_INPUT_MESSAGES] = JSON.stringify(
        this._inputMessages
      );
    }
    if (this._outputMessages.length > 0) {
      attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] = JSON.stringify(
        this._outputMessages.map(output => output.message)
      );
    }

    const instructions = getSystemInstructions(options?.systemPrompt);
    if (instructions) {
      attributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] = JSON.stringify(
        instructions.map(content => ({ type: 'text', content }))
      );
    }
    return attributes;
  }

  private _recordAssistantMessage(
    message: Extract<SDKMessage, { type: 'assistant' }>
  ): void {
    const parts = message.message.content.map(mapContentBlock);
    const stopDetails = getRecordProperty(message.message, 'stop_details');
    if (stopDetails) {
      parts.push({ ...toJsonRecord(stopDetails), type: 'refusal' });
    }
    this._appendOutput({
      id: message.message.id,
      message: {
        role: 'assistant',
        parts,
        finish_reason:
          message.message.stop_reason ??
          (message.aborted ? 'cancelled' : 'stop'),
      },
      partial: false,
    });
  }

  private _recordPartialMessage(
    message: Extract<SDKMessage, { type: 'stream_event' }>
  ): void {
    const event = message.event;
    if (event.type === 'message_start') {
      this._partialOutput = {
        id: event.message.id,
        blocks: [...event.message.content],
        finishReason: event.message.stop_reason ?? undefined,
      };
      return;
    }
    if (!this._partialOutput) {
      return;
    }

    if (event.type === 'content_block_start') {
      this._partialOutput.blocks[event.index] = event.content_block;
    } else if (event.type === 'content_block_delta') {
      applyContentDelta(this._partialOutput.blocks, event.index, event.delta);
    } else if (event.type === 'message_delta') {
      this._partialOutput.finishReason =
        event.delta.stop_reason ?? this._partialOutput.finishReason;
    } else if (event.type === 'message_stop') {
      const output = this._partialOutput;
      this._partialOutput = undefined;
      this._appendOutput({
        id: output.id,
        message: {
          role: 'assistant',
          parts: output.blocks.filter(Boolean).map(mapContentBlock),
          finish_reason: output.finishReason ?? 'stop',
        },
        partial: true,
      });
    }
  }

  private _recordResult(message: SDKResultMessage): void {
    const finishReason =
      message.stop_reason ?? (message.subtype === 'success' ? 'stop' : 'error');
    const extraParts: MessagePart[] = [];
    if (message.subtype === 'success') {
      if (message.structured_output !== undefined) {
        extraParts.push({
          type: 'structured_output',
          content: toJsonValue(message.structured_output),
        });
      }
      if (this._outputMessages.length === 0 && message.result) {
        extraParts.unshift({ type: 'text', content: message.result });
      }
    } else if (message.errors.length > 0) {
      extraParts.push({ type: 'error', content: [...message.errors] });
    }

    const lastOutput =
      this._outputMessages.length > this._turnOutputStart
        ? this._outputMessages.at(-1)
        : undefined;
    if (lastOutput) {
      lastOutput.message.finish_reason = finishReason;
      lastOutput.message.parts.push(...extraParts);
    } else if (extraParts.length > 0) {
      this._appendOutput({
        message: {
          role: 'assistant',
          parts: extraParts,
          finish_reason: finishReason,
        },
        partial: false,
      });
    }
    this._turnOutputStart = this._outputMessages.length;
  }

  private _appendInput(message: GenAIMessage): void {
    if (message.parts.length === 0) {
      return;
    }
    const previous = this._inputMessages.at(-1);
    if (previous && JSON.stringify(previous) === JSON.stringify(message)) {
      return;
    }
    this._inputMessages.push(message);
  }

  private _appendOutput(output: CapturedOutput): void {
    if (output.message.parts.length === 0) {
      return;
    }
    if (!output.id) {
      this._outputMessages.push(output);
      return;
    }

    const index = this._outputIndexes.get(output.id);
    if (index === undefined) {
      this._outputIndexes.set(output.id, this._outputMessages.length);
      this._outputMessages.push(output);
      return;
    }

    const current = this._outputMessages[index];
    if (current.partial && !output.partial) {
      this._outputMessages[index] = output;
    } else if (!current.partial && output.partial) {
      return;
    } else {
      current.message.parts.push(...output.message.parts);
      current.message.finish_reason = output.message.finish_reason;
    }
  }
}

function getSystemInstructions(
  systemPrompt: Options['systemPrompt']
): string[] | undefined {
  if (typeof systemPrompt === 'string') {
    return [systemPrompt];
  }
  if (Array.isArray(systemPrompt)) {
    return systemPrompt;
  }
  return systemPrompt?.append ? [systemPrompt.append] : undefined;
}

function mapContentBlock(block: unknown): MessagePart {
  if (!isRecord(block) || typeof block.type !== 'string') {
    return { type: 'unknown', value: toJsonValue(block) };
  }

  switch (block.type) {
    case 'text':
      return copyOptional(
        { type: 'text', content: block.text },
        block,
        'citations'
      );
    case 'thinking':
      return { type: 'reasoning', content: block.thinking };
    case 'redacted_thinking':
      return {
        type: 'reasoning',
        encrypted_content: block.data,
      };
    case 'tool_use':
    case 'mcp_tool_use':
      return copyOptional(
        {
          type: 'tool_call',
          id: block.id,
          name: block.name,
          arguments: toJsonValue(block.input),
        },
        block,
        'server_name'
      );
    case 'tool_result':
    case 'mcp_tool_result':
      return {
        type: 'tool_call_response',
        id: block.tool_use_id,
        response: toJsonValue(block.content ?? null),
        is_error: block.is_error,
      };
    case 'server_tool_use':
      return {
        type: 'server_tool_call',
        id: block.id,
        name: block.name,
        server_tool_call: {
          type: block.name,
          input: toJsonValue(block.input),
          caller: toJsonValue(block.caller),
        },
      };
    case 'image':
    case 'document':
      return mapReferencedContent(block.source, block.type);
    case 'compaction':
      return {
        type: 'compaction',
        id: block.id,
        content: block.content,
        encrypted_content: block.encrypted_content,
      };
    default:
      if (block.type.endsWith('_tool_result')) {
        return {
          type: 'server_tool_call_response',
          id: block.tool_use_id,
          server_tool_call_response: toJsonValue(block),
        };
      }
      return toJsonRecord(block);
  }
}

function mapReferencedContent(
  source: unknown,
  modality: 'image' | 'document'
): MessagePart {
  if (!isRecord(source) || typeof source.type !== 'string') {
    return { type: modality, source: toJsonValue(source) };
  }
  if (source.type === 'base64') {
    return {
      type: 'blob',
      modality,
      mime_type: source.media_type,
      content: source.data,
    };
  }
  if (source.type === 'url') {
    return {
      type: 'uri',
      modality,
      mime_type: source.media_type,
      uri: source.url,
    };
  }
  if (source.type === 'file') {
    return {
      type: 'file',
      modality,
      mime_type: source.media_type,
      file_id: source.file_id,
    };
  }
  if (source.type === 'text') {
    return {
      type: 'text',
      modality,
      mime_type: source.media_type,
      content: source.data,
    };
  }
  return { type: modality, source: toJsonValue(source) };
}

function applyContentDelta(
  blocks: unknown[],
  index: number,
  delta: unknown
): void {
  if (!isRecord(delta) || typeof delta.type !== 'string') {
    return;
  }
  const existing = blocks[index];
  const current: Record<string, unknown> = isRecord(existing) ? existing : {};
  if (delta.type === 'text_delta') {
    current.type = 'text';
    current.text = `${stringValue(current.text)}${stringValue(delta.text)}`;
  } else if (delta.type === 'thinking_delta') {
    current.type = 'thinking';
    current.thinking = `${stringValue(current.thinking)}${stringValue(
      delta.thinking
    )}`;
  } else if (delta.type === 'input_json_delta') {
    current.type = 'tool_use';
    const partialJson = `${stringValue(current.partial_json)}${stringValue(
      delta.partial_json
    )}`;
    current.partial_json = partialJson;
    try {
      current.input = JSON.parse(partialJson);
    } catch {
      current.input = partialJson;
    }
  } else if (delta.type === 'citations_delta') {
    const citations = Array.isArray(current.citations) ? current.citations : [];
    citations.push(toJsonValue(delta.citation));
    current.citations = citations;
  } else if (delta.type === 'signature_delta') {
    current.signature = delta.signature;
  } else if (delta.type === 'compaction_delta') {
    current.content = delta.content;
    current.encrypted_content = delta.encrypted_content;
  } else {
    for (const [key, value] of Object.entries(toJsonRecord(delta))) {
      if (key !== 'type') {
        current[key] = value;
      }
    }
  }
  blocks[index] = current;
}

export function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function copyOptional(
  target: MessagePart,
  source: Record<string, unknown>,
  property: string
): MessagePart {
  if (source[property] !== undefined) {
    target[property] = toJsonValue(source[property]);
  }
  return target;
}

function getRecordProperty(
  value: object,
  property: string
): Record<string, unknown> | undefined {
  const candidate = Reflect.get(value, property) as unknown;
  return isRecord(candidate) ? candidate : undefined;
}

function toJsonRecord(value: Record<string, unknown>): MessagePart {
  const serialized = safeJsonStringify(value);
  if (!serialized) {
    return {
      type: typeof value.type === 'string' ? value.type : 'unknown',
    };
  }
  return JSON.parse(serialized) as MessagePart;
}

function toJsonValue(value: unknown): unknown {
  const serialized = safeJsonStringify(value);
  return serialized === undefined
    ? undefined
    : (JSON.parse(serialized) as unknown);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
