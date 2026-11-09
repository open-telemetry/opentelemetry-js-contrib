/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GEN_AI_FINISH_REASON_VALUE_COMPACTION,
  GEN_AI_FINISH_REASON_VALUE_CONTENT_FILTER,
  GEN_AI_FINISH_REASON_VALUE_ERROR,
  GEN_AI_FINISH_REASON_VALUE_LENGTH,
  GEN_AI_FINISH_REASON_VALUE_STOP,
  GEN_AI_FINISH_REASON_VALUE_TOOL_CALL,
  type ChatMessage,
  type CompactionPart,
  type FilePart,
  type FinishReason,
  type GenericPart,
  type InputMessages,
  type MessagePart,
  type OutputMessages,
  type ReasoningPart,
  type ServerToolCallPart,
  type ServerToolCallResponsePart,
  type SystemInstructions,
  type TextPart,
  type ToolCallRequestPart,
  type ToolCallResponsePart,
} from '@opentelemetry/genai-util';
import type {
  EasyInputMessage,
  Response,
  ResponseCodeInterpreterToolCall,
  ResponseComputerToolCall,
  ResponseCreateParams,
  ResponseCustomToolCall,
  ResponseCustomToolCallOutput,
  ResponseFileSearchToolCall,
  ResponseFunctionToolCall,
  ResponseFunctionWebSearch,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseReasoningItem,
  Responses,
} from 'openai/resources/responses/responses';
import { decodeBase64, parseJsonArguments, parseUriOrBlobPart } from './utils';

const CLIENT_ACTIONABLE_OUTPUT_ITEM_TYPES = new Set<string>([
  'function_call',
  'custom_tool_call',
  'computer_call',
  'local_shell_call',
  'mcp_approval_request',
]);

/**
 * Extract a conversation ID from OpenAI Responses `conversation` request/response
 * fields (accepting either a string ID or `{ id: string }`).
 */
export function extractResponsesConversationId(
  conversation:
    | ResponseCreateParams['conversation']
    | Response['conversation']
    | null
    | undefined
): string | undefined {
  if (!conversation) {
    return undefined;
  }
  if (typeof conversation === 'string') {
    return conversation.length > 0 ? conversation : undefined;
  }
  if (typeof conversation === 'object' && 'id' in conversation) {
    return typeof conversation.id === 'string' && conversation.id.length > 0
      ? conversation.id
      : undefined;
  }
  return undefined;
}

/**
 * Check whether an OpenAI Responses `input` or `output` item array contains
 * any conversation compaction items (`type === 'compaction'`).
 */
export function hasCompactionItems(items: unknown): boolean {
  if (!Array.isArray(items)) {
    return false;
  }
  return items.some(
    item =>
      typeof item === 'object' &&
      item !== null &&
      'type' in item &&
      (item as { type?: unknown }).type === 'compaction'
  );
}

/**
 * Derive a standardized `FinishReason` from an OpenAI Responses `Response`
 * status, incomplete details, and output items.
 */
export function deriveResponsesFinishReason(
  outputItems: ReadonlyArray<ResponseOutputItem>,
  status?: string | null,
  incompleteDetails?: Response.IncompleteDetails | null
): FinishReason {
  if (status === 'failed' || status === 'cancelled') {
    return GEN_AI_FINISH_REASON_VALUE_ERROR;
  }
  if (status === 'incomplete') {
    if (incompleteDetails?.reason === 'max_output_tokens') {
      return GEN_AI_FINISH_REASON_VALUE_LENGTH;
    }
    if (incompleteDetails?.reason === 'content_filter') {
      return GEN_AI_FINISH_REASON_VALUE_CONTENT_FILTER;
    }
    return 'incomplete';
  }
  for (const item of outputItems) {
    const itemType = (item as { type?: string }).type;
    if (itemType && CLIENT_ACTIONABLE_OUTPUT_ITEM_TYPES.has(itemType)) {
      return GEN_AI_FINISH_REASON_VALUE_TOOL_CALL;
    }
  }
  const lastItem = outputItems[outputItems.length - 1] as
    | { type?: string }
    | undefined;
  if (lastItem?.type === 'compaction') {
    return GEN_AI_FINISH_REASON_VALUE_COMPACTION;
  }
  return GEN_AI_FINISH_REASON_VALUE_STOP;
}

/**
 * Convert top-level OpenAI Responses `instructions` into `genai-util`
 * `SystemInstructions`.
 */
export function extractResponsesSystemInstructions(
  instructions: string | null | undefined
): SystemInstructions | undefined {
  if (typeof instructions !== 'string' || instructions.trim().length === 0) {
    return undefined;
  }
  return [{ type: 'text', content: instructions }];
}

function convertMessageContentItemParts(
  item:
    | EasyInputMessage
    | ResponseInputItem.Message
    | Responses.ResponseInputMessageItem
    | ResponseOutputMessage
): MessagePart[] {
  const parts: MessagePart[] = [];
  if (typeof item.content === 'string') {
    parts.push({
      type: 'text',
      content: item.content,
    } satisfies TextPart);
    return parts;
  }

  if (!Array.isArray(item.content)) {
    return parts;
  }

  for (const content of item.content) {
    switch (content.type) {
      case 'input_text':
      case 'output_text':
        parts.push({
          type: 'text',
          content: content.text,
        } satisfies TextPart);
        break;
      case 'refusal':
        parts.push({
          type: 'refusal',
          refusal: content.refusal,
        } satisfies GenericPart);
        break;
      case 'input_image':
        if (content.file_id) {
          parts.push({
            type: 'file',
            modality: 'image',
            file_id: content.file_id,
          } satisfies FilePart);
        } else if (content.image_url) {
          parts.push(parseUriOrBlobPart(content.image_url, 'image'));
        } else {
          parts.push({ type: 'image' } satisfies GenericPart);
        }
        break;
      case 'input_file': {
        const fileItem = content as {
          file_id?: string | null;
          file_data?: string | null;
          file_url?: string | null;
          filename?: string | null;
        };
        if (fileItem.file_id) {
          parts.push({
            type: 'file',
            modality: 'document',
            file_id: fileItem.file_id,
          } satisfies FilePart);
        } else if (fileItem.file_data) {
          parts.push(parseUriOrBlobPart(fileItem.file_data, 'document'));
        } else if (fileItem.file_url) {
          parts.push(parseUriOrBlobPart(fileItem.file_url, 'document'));
        } else {
          parts.push({
            ...(content as unknown as Record<string, unknown>),
            type: 'file',
          } satisfies GenericPart);
        }
        break;
      }
      default: {
        const raw = content as unknown as {
          type?: string;
          input_audio?: { data?: string; format?: string };
          [key: string]: unknown;
        };
        if (raw.type === 'input_audio' && raw.input_audio?.data) {
          parts.push({
            type: 'blob',
            modality: 'audio',
            ...(raw.input_audio.format
              ? { mime_type: `audio/${raw.input_audio.format}` }
              : {}),
            content: decodeBase64(raw.input_audio.data),
          });
        } else {
          parts.push({
            ...raw,
            type: typeof raw.type === 'string' ? raw.type : 'unknown',
          } satisfies GenericPart);
        }
        break;
      }
    }
  }

  return parts;
}

function convertReasoningParts(item: ResponseReasoningItem): MessagePart[] {
  const parts: MessagePart[] = [];
  for (const summary of item.summary ?? []) {
    parts.push({
      type: 'reasoning',
      content: summary.text,
    } satisfies ReasoningPart);
  }
  for (const content of item.content ?? []) {
    parts.push({
      type: 'reasoning',
      content: content.text,
    } satisfies ReasoningPart);
  }
  return parts;
}

function convertCompactionPart(item: {
  id?: string | null;
  content?: string | null;
  encrypted_content?: string | null;
}): CompactionPart {
  const part: CompactionPart = {
    type: 'compaction',
  };
  if (item.id) {
    part.id = item.id;
  }
  if (typeof item.content === 'string') {
    part.content = item.content;
  }
  return part;
}

function convertFileSearchParts(
  item: ResponseFileSearchToolCall
): MessagePart[] {
  const parts: MessagePart[] = [
    {
      type: 'server_tool_call',
      id: item.id,
      name: item.type,
      server_tool_call: {
        type: item.type,
        queries: item.queries,
      },
    } satisfies ServerToolCallPart,
  ];
  if (item.results && item.results.length > 0) {
    parts.push({
      type: 'server_tool_call_response',
      id: item.id,
      server_tool_call_response: {
        type: item.type,
        results: item.results,
      },
    } satisfies ServerToolCallResponsePart);
  }
  return parts;
}

function convertWebSearchParts(item: ResponseFunctionWebSearch): MessagePart[] {
  return [
    {
      type: 'server_tool_call',
      id: item.id,
      name: item.type,
      server_tool_call: {
        type: item.type,
        action: item.action,
      },
    } satisfies ServerToolCallPart,
  ];
}

function convertCodeInterpreterParts(
  item: ResponseCodeInterpreterToolCall
): MessagePart[] {
  const parts: MessagePart[] = [
    {
      type: 'server_tool_call',
      id: item.id,
      name: item.type,
      server_tool_call: {
        type: item.type,
        code: item.code,
        container_id: item.container_id,
      },
    } satisfies ServerToolCallPart,
  ];
  if (item.outputs && item.outputs.length > 0) {
    parts.push({
      type: 'server_tool_call_response',
      id: item.id,
      server_tool_call_response: {
        type: item.type,
        outputs: item.outputs,
      },
    } satisfies ServerToolCallResponsePart);
  }
  return parts;
}

function convertImageGenerationParts(
  item:
    | ResponseInputItem.ImageGenerationCall
    | ResponseOutputItem.ImageGenerationCall
): MessagePart[] {
  const parts: MessagePart[] = [
    {
      type: 'server_tool_call',
      id: item.id,
      name: item.type,
      server_tool_call: {
        type: item.type,
      },
    } satisfies ServerToolCallPart,
  ];
  if (item.result != null) {
    parts.push({
      type: 'server_tool_call_response',
      id: item.id,
      server_tool_call_response: {
        type: item.type,
        result: item.result,
      },
    } satisfies ServerToolCallResponsePart);
  }
  return parts;
}

function convertMcpCallParts(
  item: ResponseInputItem.McpCall | ResponseOutputItem.McpCall
): MessagePart[] {
  const parts: MessagePart[] = [
    {
      type: 'server_tool_call',
      id: item.id,
      name: item.name,
      server_tool_call: {
        type: item.type,
        server_label: item.server_label,
        arguments: parseJsonArguments(item.arguments),
      },
    } satisfies ServerToolCallPart,
  ];
  if (item.output != null || item.error != null) {
    parts.push({
      type: 'server_tool_call_response',
      id: item.id,
      server_tool_call_response: {
        type: item.type,
        server_label: item.server_label,
        ...(item.error != null
          ? { error: item.error }
          : { output: item.output }),
      },
    } satisfies ServerToolCallResponsePart);
  }
  return parts;
}

function convertMcpListToolsParts(
  item: ResponseInputItem.McpListTools | ResponseOutputItem.McpListTools
): MessagePart[] {
  return [
    {
      type: 'server_tool_call_response',
      id: item.id,
      server_tool_call_response: {
        type: item.type,
        server_label: item.server_label,
        ...(item.error != null ? { error: item.error } : { tools: item.tools }),
      },
    } satisfies ServerToolCallResponsePart,
  ];
}

function convertFunctionCallPart(
  item: ResponseFunctionToolCall
): ToolCallRequestPart {
  return {
    type: 'tool_call',
    id: item.call_id ?? item.id,
    name: item.name,
    arguments: parseJsonArguments(item.arguments),
  };
}

function convertCustomToolCallPart(
  item: ResponseCustomToolCall
): ToolCallRequestPart {
  return {
    type: 'tool_call',
    id: item.call_id ?? item.id,
    name: item.name,
    arguments: item.input,
  };
}

function convertComputerCallPart(
  item: ResponseComputerToolCall
): ToolCallRequestPart {
  return {
    type: 'tool_call',
    id: item.call_id ?? item.id,
    name: item.type,
    arguments: item.action,
  };
}

function convertLocalShellCallPart(
  item: ResponseInputItem.LocalShellCall | ResponseOutputItem.LocalShellCall
): ToolCallRequestPart {
  return {
    type: 'tool_call',
    id: item.call_id ?? item.id,
    name: item.type,
    arguments: item.action,
  };
}

function convertMcpApprovalRequestPart(
  item:
    | ResponseInputItem.McpApprovalRequest
    | ResponseOutputItem.McpApprovalRequest
): ToolCallRequestPart {
  return {
    type: 'tool_call',
    id: item.id,
    name: item.name,
    arguments: parseJsonArguments(item.arguments),
    server_label: item.server_label,
  };
}

function convertInputItemToChatMessage(item: ResponseInputItem): ChatMessage {
  const itemType = (item as { type?: string }).type ?? 'message';
  switch (itemType) {
    case 'message':
      return {
        role: (item as EasyInputMessage).role,
        parts: convertMessageContentItemParts(item as EasyInputMessage),
      };
    case 'function_call':
      return {
        role: 'assistant',
        parts: [convertFunctionCallPart(item as ResponseFunctionToolCall)],
      };
    case 'function_call_output': {
      const out = item as ResponseInputItem.FunctionCallOutput;
      const response =
        typeof out.output === 'string'
          ? (parseJsonArguments(out.output) ?? out.output)
          : out.output;
      return {
        role: 'tool',
        parts: [
          {
            type: 'tool_call_response',
            id: out.call_id ?? out.id,
            response,
          } satisfies ToolCallResponsePart,
        ],
      };
    }
    case 'custom_tool_call':
      return {
        role: 'assistant',
        parts: [convertCustomToolCallPart(item as ResponseCustomToolCall)],
      };
    case 'custom_tool_call_output': {
      const out = item as ResponseCustomToolCallOutput;
      return {
        role: 'tool',
        parts: [
          {
            type: 'tool_call_response',
            id: out.call_id ?? out.id,
            response: out.output,
          } satisfies ToolCallResponsePart,
        ],
      };
    }
    case 'reasoning':
      return {
        role: 'assistant',
        parts: convertReasoningParts(item as ResponseReasoningItem),
      };
    case 'compaction':
      return {
        role: 'assistant',
        parts: [
          convertCompactionPart(
            item as unknown as {
              id?: string | null;
              content?: string | null;
              encrypted_content?: string | null;
            }
          ),
        ],
      };
    case 'file_search_call':
      return {
        role: 'assistant',
        parts: convertFileSearchParts(item as ResponseFileSearchToolCall),
      };
    case 'web_search_call':
      return {
        role: 'assistant',
        parts: convertWebSearchParts(item as ResponseFunctionWebSearch),
      };
    case 'code_interpreter_call':
      return {
        role: 'assistant',
        parts: convertCodeInterpreterParts(
          item as ResponseCodeInterpreterToolCall
        ),
      };
    case 'image_generation_call':
      return {
        role: 'assistant',
        parts: convertImageGenerationParts(
          item as ResponseInputItem.ImageGenerationCall
        ),
      };
    case 'mcp_call':
      return {
        role: 'assistant',
        parts: convertMcpCallParts(item as ResponseInputItem.McpCall),
      };
    case 'mcp_list_tools':
      return {
        role: 'assistant',
        parts: convertMcpListToolsParts(item as ResponseInputItem.McpListTools),
      };
    case 'mcp_approval_request':
      return {
        role: 'assistant',
        parts: [
          convertMcpApprovalRequestPart(
            item as ResponseInputItem.McpApprovalRequest
          ),
        ],
      };
    case 'mcp_approval_response': {
      const resp = item as ResponseInputItem.McpApprovalResponse;
      return {
        role: 'tool',
        parts: [
          {
            type: 'tool_call_response',
            id: resp.approval_request_id ?? resp.id,
            response: resp.approve,
          } satisfies ToolCallResponsePart,
        ],
      };
    }
    case 'computer_call':
      return {
        role: 'assistant',
        parts: [convertComputerCallPart(item as ResponseComputerToolCall)],
      };
    case 'computer_call_output': {
      const out = item as ResponseInputItem.ComputerCallOutput;
      return {
        role: 'tool',
        parts: [
          {
            type: 'tool_call_response',
            id: out.call_id ?? out.id,
            response: out.output,
          } satisfies ToolCallResponsePart,
        ],
      };
    }
    case 'local_shell_call':
      return {
        role: 'assistant',
        parts: [
          convertLocalShellCallPart(item as ResponseInputItem.LocalShellCall),
        ],
      };
    case 'local_shell_call_output': {
      const out = item as ResponseInputItem.LocalShellCallOutput;
      return {
        role: 'tool',
        parts: [
          {
            type: 'tool_call_response',
            id: out.id,
            response: out.output,
          } satisfies ToolCallResponsePart,
        ],
      };
    }
    case 'item_reference': {
      const ref = item as ResponseInputItem.ItemReference;
      return {
        role: 'assistant',
        parts: [
          {
            type: 'item_reference',
            id: ref.id,
          } satisfies GenericPart,
        ],
      };
    }
    default: {
      const generic = item as unknown as Record<string, unknown>;
      return {
        role:
          typeof generic.role === 'string' && generic.role.length > 0
            ? generic.role
            : 'user',
        parts: [
          {
            ...generic,
            type: itemType,
          } satisfies GenericPart,
        ],
      };
    }
  }
}

/**
 * Convert OpenAI Responses `params.input` into `genai-util` `InputMessages`.
 */
export function convertResponsesInputToMessages(
  input: ResponseCreateParams['input']
): InputMessages {
  if (!input) {
    return [];
  }
  if (typeof input === 'string') {
    return [
      {
        role: 'user',
        parts: [{ type: 'text', content: input }],
      },
    ];
  }
  if (Array.isArray(input)) {
    return input.map(convertInputItemToChatMessage);
  }
  return [];
}

function convertOutputItemToParts(item: ResponseOutputItem): MessagePart[] {
  const itemType = (item as { type?: string }).type ?? 'unknown';
  switch (itemType) {
    case 'message':
      return convertMessageContentItemParts(item as ResponseOutputMessage);
    case 'function_call':
      return [convertFunctionCallPart(item as ResponseFunctionToolCall)];
    case 'custom_tool_call':
      return [convertCustomToolCallPart(item as ResponseCustomToolCall)];
    case 'reasoning':
      return convertReasoningParts(item as ResponseReasoningItem);
    case 'compaction':
      return [
        convertCompactionPart(
          item as unknown as {
            id?: string | null;
            content?: string | null;
            encrypted_content?: string | null;
          }
        ),
      ];
    case 'file_search_call':
      return convertFileSearchParts(item as ResponseFileSearchToolCall);
    case 'web_search_call':
      return convertWebSearchParts(item as ResponseFunctionWebSearch);
    case 'code_interpreter_call':
      return convertCodeInterpreterParts(
        item as ResponseCodeInterpreterToolCall
      );
    case 'image_generation_call':
      return convertImageGenerationParts(
        item as ResponseOutputItem.ImageGenerationCall
      );
    case 'mcp_call':
      return convertMcpCallParts(item as ResponseOutputItem.McpCall);
    case 'mcp_list_tools':
      return convertMcpListToolsParts(item as ResponseOutputItem.McpListTools);
    case 'mcp_approval_request':
      return [
        convertMcpApprovalRequestPart(
          item as ResponseOutputItem.McpApprovalRequest
        ),
      ];
    case 'computer_call':
      return [convertComputerCallPart(item as ResponseComputerToolCall)];
    case 'local_shell_call':
      return [
        convertLocalShellCallPart(item as ResponseOutputItem.LocalShellCall),
      ];
    default: {
      const generic = item as unknown as Record<string, unknown>;
      return [
        {
          ...generic,
          type: itemType,
        } satisfies GenericPart,
      ];
    }
  }
}

/**
 * Convert OpenAI Responses `output` items into `genai-util` `OutputMessages`.
 */
export function convertResponsesOutputToMessages(
  outputItems: ReadonlyArray<ResponseOutputItem>,
  finishReason: FinishReason
): OutputMessages {
  const parts: MessagePart[] = outputItems.flatMap(convertOutputItemToParts);
  return [
    {
      role: 'assistant',
      parts,
      finish_reason: finishReason,
    },
  ];
}
