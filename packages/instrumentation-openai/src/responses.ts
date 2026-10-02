/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  EasyInputMessage,
  ResponseCodeInterpreterToolCall,
  ResponseComputerToolCall,
  ResponseCreateParams,
  ResponseCustomToolCall,
  ResponseCustomToolCallOutput,
  ResponseFileSearchToolCall,
  ResponseFunctionToolCall,
  ResponseFunctionWebSearch,
  ResponseOutputItem,
  ResponseOutputMessage,
  ResponseReasoningItem,
  ResponseInputItem,
  Responses,
} from 'openai/resources/responses/responses';
import type {
  GenericPart,
  MessagePart,
  OutputMessages,
  TextPart,
  ToolCallRequestPart,
  ToolCallResponsePart,
  ChatMessage,
  InputMessages,
} from './internal-types';

export class ConvertResponseInputsToInputMessagesUseCase {
  constructor(private readonly captureMessageContent = false) {}

  convert(params: ResponseCreateParams): InputMessages {
    const messages: Array<ChatMessage> = [];

    if (typeof params.instructions === 'string') {
      messages.push(
        this.message({ role: 'system', content: params.instructions })
      );
    }
    if (typeof params.input === 'string') {
      messages.push(this.message({ role: 'user', content: params.input }));
    } else if (Array.isArray(params.input)) {
      messages.push(
        ...params.input.map(
          (input): ChatMessage =>
            (this as any)[input.type ?? 'message'](input as never)
        )
      );
    }

    return messages;
  }

  message(
    item:
      | EasyInputMessage
      | ResponseInputItem.Message
      | Responses.ResponseInputMessageItem
      | ResponseOutputMessage
  ): ChatMessage {
    const parts: Array<MessagePart> = [];
    if (typeof item.content === 'string') {
      if (this.captureMessageContent) {
        parts.push({
          type: 'text',
          content: item.content,
        } satisfies TextPart);
      } else {
        parts.push({
          type: 'text',
          content: undefined,
        } satisfies GenericPart);
      }
    } else if (Array.isArray(item.content)) {
      for (const content of item.content) {
        switch (content.type) {
          case 'input_text':
          case 'output_text':
            if (this.captureMessageContent) {
              parts.push({
                type: 'text',
                content: content.text,
              } satisfies TextPart);
            } else {
              parts.push({
                type: 'text',
                content: undefined,
              } satisfies GenericPart);
            }
            break;
          case 'refusal':
            parts.push({
              type: 'refusal',
              refusal: content.refusal,
            } satisfies GenericPart);
            break;
          case 'input_image':
            parts.push({
              ...(this.captureMessageContent ? (content as object) : undefined),
              type: 'image',
            } satisfies GenericPart);
            break;
          case 'input_file':
            parts.push({
              ...(this.captureMessageContent ? (content as object) : undefined),
              type: 'file',
            } satisfies GenericPart);
            break;
          default: {
            parts.push({
              ...(this.captureMessageContent ? (content as object) : undefined),
              type: 'audio',
            } satisfies GenericPart);
            break;
          }
        }
      }
    }

    return {
      role: item.role,
      parts,
    } satisfies ChatMessage;
  }

  function_call(item: ResponseFunctionToolCall): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.name,
          arguments: this.captureMessageContent ? item.arguments : undefined,
          call_id: item.call_id,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  custom_tool_call(item: ResponseCustomToolCall): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.name,
          arguments: this.captureMessageContent ? item.input : undefined,
          call_id: item.call_id,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  reasoning(item: ResponseReasoningItem): ChatMessage {
    const parts: Array<MessagePart> = [];
    for (const summary of item.summary) {
      parts.push({
        type: item.type,
        text: this.captureMessageContent ? summary.text : undefined,
      });
    }
    if (item.content) {
      for (const content of item.content) {
        parts.push({
          type: item.type,
          text: this.captureMessageContent ? content.text : undefined,
        });
      }
    }

    return {
      role: 'assistant',
      parts,
    } satisfies ChatMessage;
  }

  file_search_call(item: ResponseFileSearchToolCall): ChatMessage {
    const parts: Array<MessagePart> = [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.queries : undefined,
      } satisfies ToolCallRequestPart,
    ];
    for (const result of item.results ?? []) {
      parts.push({
        type: 'tool_call_response',
        id: item.id,
        response: this.captureMessageContent ? result : undefined,
      } satisfies ToolCallResponsePart);
    }

    return {
      role: 'assistant',
      parts,
    } satisfies ChatMessage;
  }

  web_search_call(item: ResponseFunctionWebSearch): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.type,
          arguments: this.captureMessageContent ? item.action : undefined,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  computer_call(item: ResponseComputerToolCall): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.type,
          arguments: this.captureMessageContent ? item.action : undefined,
          call_id: item.call_id,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  computer_call_output(
    item: ResponseInputItem.ComputerCallOutput
  ): ChatMessage {
    return {
      role: 'user',
      parts: [
        {
          type: 'tool_call_response',
          id: item.id,
          response: this.captureMessageContent ? item.output : undefined,
          call_id: item.call_id,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  code_interpreter_call(item: ResponseCodeInterpreterToolCall): ChatMessage {
    const parts: Array<MessagePart> = [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.code : undefined,
      } satisfies ToolCallRequestPart,
    ];
    for (const output of item.outputs ?? []) {
      switch (output.type) {
        case 'image':
          parts.push({
            type: 'tool_call_response',
            id: item.id,
            response: this.captureMessageContent ? output.url : undefined,
          } satisfies ToolCallResponsePart);
          break;
        case 'logs':
          parts.push({
            type: 'tool_call_response',
            id: item.id,
            response: this.captureMessageContent ? output.logs : undefined,
          } satisfies ToolCallResponsePart);
          break;
      }
    }

    return {
      role: 'assistant',
      parts,
    } satisfies ChatMessage;
  }

  image_generation_call(
    item:
      | ResponseInputItem.ImageGenerationCall
      | ResponseOutputItem.ImageGenerationCall
  ): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.type,
        } satisfies ToolCallRequestPart,
        {
          type: 'tool_call_response',
          id: item.id,
          response: this.captureMessageContent ? item.result : undefined,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  function_call_output(
    item: ResponseInputItem.FunctionCallOutput
  ): ChatMessage {
    return {
      role: 'user',
      parts: [
        {
          type: 'tool_call_response',
          id: item.id,
          response: this.captureMessageContent ? item.output : undefined,
          call_id: item.call_id,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  local_shell_call(
    item: ResponseInputItem.LocalShellCall | ResponseOutputItem.LocalShellCall
  ): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.type,
          arguments: this.captureMessageContent ? item.action : undefined,
          call_id: item.call_id,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  local_shell_call_output(
    item: ResponseInputItem.LocalShellCallOutput
  ): ChatMessage {
    return {
      role: 'user',
      parts: [
        {
          type: 'tool_call_response',
          id: item.id,
          response: this.captureMessageContent ? item.output : undefined,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  mcp_call(
    item: ResponseInputItem.McpCall | ResponseOutputItem.McpCall
  ): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: item.type,
          arguments: this.captureMessageContent
            ? `${item.name}(${item.arguments})`
            : undefined,
          server: item.server_label,
        } satisfies ToolCallRequestPart,
        {
          type: 'tool_call_response',
          id: item.id,
          response: item.error
            ? item.error
            : this.captureMessageContent
              ? item.output
              : undefined,
          server: item.server_label,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  mcp_list_tools(item: ResponseInputItem.McpListTools): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call_response',
          id: item.id,
          response: item.error
            ? item.error
            : this.captureMessageContent
              ? item.tools
              : undefined,
          server: item.server_label,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  mcp_approval_request(
    item: ResponseInputItem.McpApprovalRequest
  ): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'tool_call',
          id: item.id,
          name: `${item.type}${this.captureMessageContent ? `: ${item.name}` : ''}`,
          arguments: this.captureMessageContent ? item.arguments : undefined,
          server: item.server_label,
        } satisfies ToolCallRequestPart,
      ],
    } satisfies ChatMessage;
  }

  mcp_approval_response(
    item: ResponseInputItem.McpApprovalResponse
  ): ChatMessage {
    return {
      role: 'user',
      parts: [
        {
          type: 'tool_call_response',
          response: this.captureMessageContent ? item.approve : undefined,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  custom_tool_call_output(item: ResponseCustomToolCallOutput): ChatMessage {
    return {
      role: 'user',
      parts: [
        {
          type: 'tool_call_response',
          id: item.id,
          response: this.captureMessageContent ? item.output : undefined,
          call_id: item.call_id,
        } satisfies ToolCallResponsePart,
      ],
    } satisfies ChatMessage;
  }

  item_reference(item: ResponseInputItem.ItemReference): ChatMessage {
    return {
      role: 'assistant',
      parts: [
        {
          type: 'item_reference',
          id: item.id,
        } satisfies GenericPart,
      ],
    } satisfies ChatMessage;
  }
}

export class ConvertResponseOutputsToOutputMessagesUseCase {
  constructor(private readonly captureMessageContent = false) {}

  convert(responseOutput: Array<ResponseOutputItem>): OutputMessages {
    const parts: Array<MessagePart> = responseOutput.flatMap(
      (item: ResponseOutputItem) => (this as any)[item.type](item as never)
    );

    return [
      {
        role: 'assistant',
        parts,
        finish_reason:
          parts[parts.length - 1]?.type === 'tool_call' ? 'tool_call' : 'stop',
      },
    ];
  }

  message(item: ResponseOutputMessage): Array<MessagePart> {
    const parts: Array<MessagePart> = [];
    for (const content of item.content) {
      switch (content.type) {
        case 'output_text':
          if (this.captureMessageContent) {
            parts.push({
              type: 'text',
              content: content.text,
            } satisfies TextPart);
          } else {
            parts.push({
              type: 'text',
              content: undefined,
            } satisfies GenericPart);
          }
          break;
        case 'refusal':
          parts.push({
            type: content.type,
            refusal: content.refusal,
          } satisfies GenericPart);
          break;
      }
    }

    return parts;
  }

  function_call(item: ResponseFunctionToolCall): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.name,
        arguments: this.captureMessageContent ? item.arguments : undefined,
        call_id: item.call_id,
      } satisfies ToolCallRequestPart,
    ];
  }

  custom_tool_call(item: ResponseCustomToolCall): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.name,
        arguments: this.captureMessageContent ? item.input : undefined,
        call_id: item.call_id,
      } satisfies ToolCallRequestPart,
    ];
  }

  reasoning(item: ResponseReasoningItem): Array<MessagePart> {
    const parts: Array<MessagePart> = [];
    for (const summary of item.summary) {
      parts.push({
        type: item.type,
        text: this.captureMessageContent ? summary.text : undefined,
      });
    }
    if (item.content) {
      for (const content of item.content) {
        parts.push({
          type: item.type,
          text: this.captureMessageContent ? content.text : undefined,
        });
      }
    }

    return parts;
  }

  file_search_call(item: ResponseFileSearchToolCall): Array<MessagePart> {
    const parts: Array<MessagePart> = [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.queries : undefined,
      } satisfies ToolCallRequestPart,
    ];
    for (const result of item.results ?? []) {
      parts.push({
        type: 'tool_call_response',
        id: item.id,
        response: this.captureMessageContent ? result : undefined,
      } satisfies ToolCallResponsePart);
    }

    return parts;
  }

  web_search_call(item: ResponseFunctionWebSearch): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.action : undefined,
      } satisfies ToolCallRequestPart,
    ];
  }

  computer_call(item: ResponseComputerToolCall): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.action : undefined,
        call_id: item.call_id,
      } satisfies ToolCallRequestPart,
    ];
  }

  code_interpreter_call(
    item: ResponseCodeInterpreterToolCall
  ): Array<MessagePart> {
    const parts: Array<MessagePart> = [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.code : undefined,
      } satisfies ToolCallRequestPart,
    ];
    for (const output of item.outputs ?? []) {
      switch (output.type) {
        case 'image':
          parts.push({
            type: 'tool_call_response',
            id: item.id,
            response: this.captureMessageContent ? output.url : undefined,
          } satisfies ToolCallResponsePart);
          break;
        case 'logs':
          parts.push({
            type: 'tool_call_response',
            id: item.id,
            response: this.captureMessageContent ? output.logs : undefined,
          } satisfies ToolCallResponsePart);
          break;
      }
    }

    return parts;
  }

  image_generation_call(
    item: ResponseOutputItem.ImageGenerationCall
  ): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
      } satisfies ToolCallRequestPart,
      {
        type: 'tool_call_response',
        id: item.id,
        response: this.captureMessageContent ? item.result : undefined,
      } satisfies ToolCallResponsePart,
    ];
  }

  local_shell_call(
    item: ResponseOutputItem.LocalShellCall
  ): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.type,
        arguments: this.captureMessageContent ? item.action : undefined,
        call_id: item.call_id,
      } satisfies ToolCallRequestPart,
    ];
  }

  mcp_call(item: ResponseOutputItem.McpCall): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: item.name,
        arguments: this.captureMessageContent
          ? `${item.name}(${item.arguments})`
          : undefined,
        server: item.server_label,
      } satisfies ToolCallRequestPart,
      {
        type: 'tool_call_response',
        id: item.id,
        response: item.error
          ? item.error
          : this.captureMessageContent
            ? item.output
            : undefined,
        server: item.server_label,
      } satisfies ToolCallResponsePart,
    ];
  }

  mcp_list_tools(item: ResponseOutputItem.McpListTools): Array<MessagePart> {
    return [
      {
        type: 'tool_call_response',
        id: item.id,
        response: item.error
          ? item.error
          : this.captureMessageContent
            ? item.tools
            : undefined,
        server: item.server_label,
      } satisfies ToolCallResponsePart,
    ];
  }

  mcp_approval_request(
    item: ResponseOutputItem.McpApprovalRequest
  ): Array<MessagePart> {
    return [
      {
        type: 'tool_call',
        id: item.id,
        name: `${item.type}${this.captureMessageContent ? `: ${item.name}` : ''}`,
        arguments: this.captureMessageContent ? item.arguments : undefined,
        server: item.server_label,
      } satisfies ToolCallRequestPart,
    ];
  }
}
