/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-expect-error -- TypeScript 5.0 misclassifies erased imports from ESM-only packages as runtime requires.
import type * as ClaudeAgentSDK from '@anthropic-ai/claude-agent-sdk';
import type { Attributes } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_AGENT_DESCRIPTION,
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
} from './semconv';

const DEFAULT_AGENT_NAME = 'Claude Code';

export interface AgentRequestInfo {
  agentName: string;
  configuredModel?: string;
  initialAttributes: Attributes;
  messageCapture?: MessageCapture;
}

export function getAgentRequestInfo({
  prompt,
  options,
  captureMessageContent,
}: {
  prompt: string | AsyncIterable<unknown>;
  options: ClaudeAgentSDK.Options | undefined;
  captureMessageContent: boolean;
}): AgentRequestInfo {
  const agentName = getAgentName(options);
  const agentDescription = getAgentDescription(options, agentName);
  const configuredModel = options?.model;

  const initialAttributes: Attributes = {
    [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
    [ATTR_GEN_AI_AGENT_NAME]: agentName,
  };

  if (agentDescription) {
    initialAttributes[ATTR_GEN_AI_AGENT_DESCRIPTION] = agentDescription;
  }
  if (configuredModel) {
    initialAttributes[ATTR_GEN_AI_REQUEST_MODEL] = configuredModel;
  }
  if (options?.resume) {
    initialAttributes[ATTR_GEN_AI_CONVERSATION_ID] = options.resume;
  }
  if (options?.outputFormat) {
    initialAttributes[ATTR_GEN_AI_OUTPUT_TYPE] = GEN_AI_OUTPUT_TYPE_VALUE_JSON;
  }

  let messageCapture: MessageCapture | undefined;
  if (captureMessageContent) {
    messageCapture = new MessageCapture(prompt);
    const systemInstructions = getSystemInstructions(options?.systemPrompt);
    if (systemInstructions) {
      initialAttributes[ATTR_GEN_AI_SYSTEM_INSTRUCTIONS] = systemInstructions;
    }
    Object.assign(initialAttributes, messageCapture.getAttributes());
  }

  return {
    agentName,
    configuredModel,
    initialAttributes,
    messageCapture,
  };
}

export function isSystemInitMessage(
  message: ClaudeAgentSDK.SDKMessage
): message is ClaudeAgentSDK.SDKSystemMessage {
  return (
    message.type === 'system' &&
    'subtype' in message &&
    message.subtype === 'init'
  );
}

export function isResultMessage(
  message: ClaudeAgentSDK.SDKMessage
): message is ClaudeAgentSDK.SDKResultMessage {
  return message.type === 'result';
}

export function isResultSuccessMessage(
  message: ClaudeAgentSDK.SDKResultMessage
): message is ClaudeAgentSDK.SDKResultSuccess {
  return message.subtype === 'success';
}

export function isResultErrorMessage(
  message: ClaudeAgentSDK.SDKResultMessage
): message is ClaudeAgentSDK.SDKResultError {
  return message.subtype !== 'success';
}

export function isAssistantErrorMessage(
  message: ClaudeAgentSDK.SDKMessage
): message is ClaudeAgentSDK.SDKAssistantMessage & {
  error: NonNullable<ClaudeAgentSDK.SDKAssistantMessage['error']>;
} {
  return message.type === 'assistant' && message.error !== undefined;
}

export function getSystemMessageAttributes({
  message,
  configuredModel,
}: {
  message: ClaudeAgentSDK.SDKSystemMessage;
  configuredModel: string | undefined;
}): Attributes {
  const attributes: Attributes = {
    [ATTR_GEN_AI_CONVERSATION_ID]: message.session_id,
  };
  if (!configuredModel) {
    attributes[ATTR_GEN_AI_REQUEST_MODEL] = message.model;
  }
  return attributes;
}

export function getResultAttributes({
  message,
}: {
  message: ClaudeAgentSDK.SDKResultMessage;
}): Attributes {
  const attributes: Attributes = {
    [ATTR_GEN_AI_CONVERSATION_ID]: message.session_id,
    [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: message.usage.input_tokens,
    [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: message.usage.output_tokens,
    [ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS]:
      message.usage.cache_creation_input_tokens,
    [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]:
      message.usage.cache_read_input_tokens,
  };

  const stopReason = getStopReason(message);
  if (stopReason) {
    attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS] = [stopReason];
  } else if (isResultSuccessMessage(message)) {
    attributes[ATTR_GEN_AI_RESPONSE_FINISH_REASONS] = ['stop'];
  }

  return attributes;
}

export function getResultErrorMessage(
  message: ClaudeAgentSDK.SDKResultError
): string {
  return message.errors.length > 0
    ? message.errors.join('; ')
    : message.subtype;
}

export function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

interface GenAIMessagePart {
  type: string;
  [key: string]: unknown;
}

interface GenAIMessage {
  role: string;
  parts: GenAIMessagePart[];
  name?: string;
}

interface GenAIOutputMessage extends GenAIMessage {
  finish_reason: string;
}

interface CapturedOutput {
  id?: string;
  message: GenAIOutputMessage;
  partial: boolean;
}

interface PartialMessage {
  id: string;
  blocks: unknown[];
  finishReason?: string;
}

export class MessageCapture {
  private readonly _inputMessages: GenAIMessage[] = [];
  private readonly _outputMessages: CapturedOutput[] = [];
  private readonly _outputIndexes = new Map<string, number>();
  private _partialMessage?: PartialMessage;
  private _turnOutputStartIndex = 0;

  constructor(prompt: string | AsyncIterable<unknown>) {
    if (typeof prompt === 'string') {
      this._appendInputMessage({
        role: 'user',
        parts: [{ type: 'text', content: prompt }],
      });
    }
  }

  wrapPrompt(
    prompt: string | AsyncIterable<ClaudeAgentSDK.SDKUserMessage>
  ): string | AsyncIterable<ClaudeAgentSDK.SDKUserMessage> {
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

  recordMessage(message: ClaudeAgentSDK.SDKMessage): void {
    if (message.type === 'assistant') {
      this._recordAssistantMessage(message);
    } else if (message.type === 'user') {
      this.recordUserMessage(message);
    } else if (message.type === 'stream_event') {
      this._recordStreamEvent(message);
    } else if (isResultMessage(message)) {
      this._recordResultMessage(message);
    }
  }

  recordUserMessage(message: ClaudeAgentSDK.SDKUserMessage): void {
    for (const captured of mapMessageParam(message.message)) {
      this._appendInputMessage(captured);
    }
  }

  getAttributes(): Attributes {
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
    return attributes;
  }

  private _recordAssistantMessage(
    message: ClaudeAgentSDK.SDKAssistantMessage
  ): void {
    const parts = message.message.content.map(mapContentBlock);
    addRefusalPart(parts, message.message);
    this._appendOutputMessage({
      id: message.message.id,
      message: {
        role: 'assistant',
        parts,
        finish_reason: message.message.stop_reason ?? 'stop',
      },
      partial: false,
    });
  }

  private _recordResultMessage(message: ClaudeAgentSDK.SDKResultMessage): void {
    const finishReason =
      getStopReason(message) ??
      (isResultSuccessMessage(message) ? 'stop' : 'error');
    const parts: GenAIMessagePart[] = [];

    if (isResultSuccessMessage(message)) {
      if (message.structured_output !== undefined) {
        parts.push({
          type: 'structured_output',
          content: message.structured_output,
        });
      }
      if (this._outputMessages.length === 0 && message.result) {
        parts.unshift({ type: 'text', content: message.result });
      }
    } else if (message.errors.length > 0) {
      parts.push({ type: 'error', content: message.errors });
    }

    const lastOutput =
      this._outputMessages.length > this._turnOutputStartIndex
        ? this._outputMessages.at(-1)
        : undefined;
    if (lastOutput) {
      lastOutput.message.finish_reason = finishReason;
      lastOutput.message.parts.push(...parts);
    } else if (parts.length > 0) {
      this._appendOutputMessage({
        message: {
          role: 'assistant',
          parts,
          finish_reason: finishReason,
        },
        partial: false,
      });
    }
    this._turnOutputStartIndex = this._outputMessages.length;
  }

  private _recordStreamEvent(
    message: ClaudeAgentSDK.SDKPartialAssistantMessage
  ): void {
    const event = message.event;
    if (event.type === 'message_start') {
      this._partialMessage = {
        id: event.message.id,
        blocks: [...event.message.content],
        finishReason: event.message.stop_reason ?? undefined,
      };
      return;
    }
    if (!this._partialMessage) {
      return;
    }

    if (event.type === 'content_block_start') {
      this._partialMessage.blocks[event.index] = event.content_block;
    } else if (event.type === 'content_block_delta') {
      applyContentBlockDelta(
        this._partialMessage.blocks,
        event.index,
        event.delta
      );
    } else if (event.type === 'message_delta') {
      this._partialMessage.finishReason =
        event.delta.stop_reason ?? this._partialMessage.finishReason;
    } else if (event.type === 'message_stop') {
      const partial = this._partialMessage;
      this._partialMessage = undefined;
      this._appendOutputMessage({
        id: partial.id,
        message: {
          role: 'assistant',
          parts: partial.blocks.filter(Boolean).map(mapContentBlock),
          finish_reason: partial.finishReason ?? 'stop',
        },
        partial: true,
      });
    }
  }

  private _appendInputMessage(message: GenAIMessage): void {
    if (message.parts.length === 0) {
      return;
    }
    const previous = this._inputMessages.at(-1);
    if (
      previous &&
      safeJsonStringify(previous) === safeJsonStringify(message)
    ) {
      return;
    }
    this._inputMessages.push(message);
  }

  private _appendOutputMessage(output: CapturedOutput): void {
    if (output.message.parts.length === 0) {
      return;
    }
    if (!output.id) {
      this._outputMessages.push(output);
      return;
    }

    const existingIndex = this._outputIndexes.get(output.id);
    if (existingIndex === undefined) {
      this._outputIndexes.set(output.id, this._outputMessages.length);
      this._outputMessages.push(output);
      return;
    }

    const existing = this._outputMessages[existingIndex];
    if (existing.partial && !output.partial) {
      this._outputMessages[existingIndex] = output;
      return;
    }
    if (!existing.partial && output.partial) {
      return;
    }
    existing.message.parts.push(...output.message.parts);
    existing.message.finish_reason = output.message.finish_reason;
  }
}

function getSystemInstructions(
  systemPrompt: ClaudeAgentSDK.Options['systemPrompt']
): string | undefined {
  let instructions: string[] = [];
  if (typeof systemPrompt === 'string') {
    instructions = [systemPrompt];
  } else if (Array.isArray(systemPrompt)) {
    instructions = systemPrompt;
  } else if (systemPrompt?.append) {
    instructions = [systemPrompt.append];
  }

  if (instructions.length === 0) {
    return undefined;
  }

  return JSON.stringify(
    instructions.map(content => ({ type: 'text', content }))
  );
}

function getAgentName(options: ClaudeAgentSDK.Options | undefined): string {
  const agent = options
    ? (Reflect.get(options, 'agent') as unknown)
    : undefined;
  return typeof agent === 'string' ? agent : DEFAULT_AGENT_NAME;
}

function getAgentDescription(
  options: ClaudeAgentSDK.Options | undefined,
  agentName: string
): string | undefined {
  if (!options) {
    return undefined;
  }
  const agents = Reflect.get(options, 'agents') as unknown;
  if (!isRecord(agents)) {
    return undefined;
  }
  const agent = agents[agentName];
  if (!isRecord(agent)) {
    return undefined;
  }
  return typeof agent.description === 'string' ? agent.description : undefined;
}

function getStopReason(
  message: ClaudeAgentSDK.SDKResultMessage
): string | undefined {
  const stopReason = Reflect.get(message, 'stop_reason') as unknown;
  return typeof stopReason === 'string' ? stopReason : undefined;
}

function mapMessageParam(
  message: ClaudeAgentSDK.SDKUserMessage['message']
): GenAIMessage[] {
  const parts =
    typeof message.content === 'string'
      ? [{ type: 'text', content: message.content }]
      : message.content.map(mapContentBlock);
  const role =
    parts.length > 0 && parts.every(part => part.type === 'tool_call_response')
      ? 'tool'
      : message.role;
  return [{ role, parts }];
}

function mapContentBlock(block: unknown): GenAIMessagePart {
  if (!isRecord(block) || typeof block.type !== 'string') {
    return { type: 'unknown', value: toJsonValue(block) };
  }

  switch (block.type) {
    case 'text':
      return withOptionalProperties(
        { type: 'text', content: block.text },
        block,
        ['citations']
      );
    case 'thinking':
      return { type: 'reasoning', content: block.thinking };
    case 'tool_use':
      return {
        type: 'tool_call',
        id: block.id,
        name: block.name,
        arguments: block.input,
      };
    case 'mcp_tool_use':
      return {
        type: 'tool_call',
        id: block.id,
        name: block.name,
        arguments: block.input,
        server_name: block.server_name,
      };
    case 'tool_result':
      return {
        type: 'tool_call_response',
        id: block.tool_use_id,
        response: block.content ?? null,
        is_error: block.is_error,
      };
    case 'mcp_tool_result':
      return {
        type: 'tool_call_response',
        id: block.tool_use_id,
        response: block.content,
        is_error: block.is_error,
      };
    case 'server_tool_use':
      return {
        type: 'server_tool_call',
        id: block.id,
        name: block.name,
        server_tool_call: {
          type: block.name,
          input: block.input,
          caller: block.caller,
        },
      };
    case 'image':
      return mapReferencedContent(block.source, 'image');
    case 'document':
      return mapReferencedContent(block.source, 'document');
    case 'compaction':
      return withOptionalProperties(
        {
          type: 'compaction',
          id: block.id,
          content: block.content,
        },
        block,
        []
      );
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
): GenAIMessagePart {
  if (!isRecord(source) || typeof source.type !== 'string') {
    return { type: modality, source: toJsonValue(source) };
  }
  if (source.type === 'base64') {
    return {
      type: 'blob',
      mime_type: source.media_type,
      modality,
      content: source.data,
    };
  }
  if (source.type === 'url') {
    return {
      type: 'uri',
      mime_type: source.media_type,
      modality,
      uri: source.url,
    };
  }
  if (source.type === 'file') {
    return {
      type: 'file',
      mime_type: source.media_type,
      modality,
      file_id: source.file_id,
    };
  }
  if (source.type === 'text' && typeof source.data === 'string') {
    return {
      type: 'text',
      content: source.data,
      mime_type: source.media_type,
      modality,
    };
  }
  return { type: modality, source: toJsonValue(source) };
}

function addRefusalPart(
  parts: GenAIMessagePart[],
  message: ClaudeAgentSDK.SDKAssistantMessage['message']
): void {
  const stopDetails = Reflect.get(message, 'stop_details') as unknown;
  if (isRecord(stopDetails)) {
    parts.push({ ...toJsonRecord(stopDetails), type: 'refusal' });
  }
}

function applyContentBlockDelta(
  blocks: unknown[],
  index: number,
  delta: unknown
): void {
  if (!isRecord(delta) || typeof delta.type !== 'string') {
    return;
  }
  const existingBlock = blocks[index];
  const block: Record<string, unknown> = isRecord(existingBlock)
    ? existingBlock
    : {};

  if (delta.type === 'text_delta') {
    block.type = 'text';
    block.text = `${typeof block.text === 'string' ? block.text : ''}${
      typeof delta.text === 'string' ? delta.text : ''
    }`;
  } else if (delta.type === 'thinking_delta') {
    block.type = 'thinking';
    block.thinking = `${
      typeof block.thinking === 'string' ? block.thinking : ''
    }${typeof delta.thinking === 'string' ? delta.thinking : ''}`;
  } else if (delta.type === 'input_json_delta') {
    block.type = 'tool_use';
    const partialJson = `${
      typeof block.partial_json === 'string' ? block.partial_json : ''
    }${typeof delta.partial_json === 'string' ? delta.partial_json : ''}`;
    block.partial_json = partialJson;
    try {
      block.input = JSON.parse(partialJson);
    } catch {
      block.input = partialJson;
    }
  } else if (delta.type === 'citations_delta') {
    const citations = Array.isArray(block.citations) ? block.citations : [];
    citations.push(toJsonValue(delta.citation));
    block.citations = citations;
  } else if (delta.type === 'signature_delta') {
    block.signature = delta.signature;
  } else if (delta.type === 'compaction_delta') {
    block.content = delta.content;
    block.encrypted_content = delta.encrypted_content;
  } else {
    for (const [key, value] of Object.entries(toJsonRecord(delta))) {
      if (key !== 'type') {
        block[key] = value;
      }
    }
  }
  blocks[index] = block;
}

function withOptionalProperties(
  target: GenAIMessagePart,
  source: Record<string, unknown>,
  properties: string[]
): GenAIMessagePart {
  for (const property of properties) {
    if (source[property] !== undefined) {
      target[property] = toJsonValue(source[property]);
    }
  }
  return target;
}

function toJsonRecord(value: Record<string, unknown>): GenAIMessagePart {
  const serialized = safeJsonStringify(value);
  if (!serialized) {
    return {
      type: typeof value.type === 'string' ? value.type : 'unknown',
    };
  }
  return JSON.parse(serialized) as GenAIMessagePart;
}

function toJsonValue(value: unknown): unknown {
  const serialized = safeJsonStringify(value);
  if (serialized === undefined) {
    return undefined;
  }
  return JSON.parse(serialized) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
