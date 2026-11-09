/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Span } from '@opentelemetry/api';
import type {
  InferenceInvocation,
  MessagePart,
  TelemetryHandler,
} from '@opentelemetry/genai-util';
import {
  converseUsage,
  firstDefined,
  isRecord,
  mapFinishReason,
  parseBody,
  toInt,
} from './extractors';

interface ToolBlock {
  id?: string;
  name: string;
  inputChunks: string[];
}

/**
 * Accumulates streamed content blocks (text, reasoning and tool calls) keyed
 * by content block index, so that the final output message can be rebuilt.
 */
class ContentBlocks {
  private readonly indices: number[] = [];
  readonly text = new Map<number, string>();
  readonly reasoning = new Map<number, string>();
  readonly tools = new Map<number, ToolBlock>();

  touch(index: number): void {
    if (!this.indices.includes(index)) this.indices.push(index);
  }

  get isEmpty(): boolean {
    return this.indices.length === 0;
  }

  appendText(index: number, text: string): void {
    this.touch(index);
    this.text.set(index, (this.text.get(index) ?? '') + text);
  }

  appendReasoning(index: number, text: string): void {
    this.touch(index);
    this.reasoning.set(index, (this.reasoning.get(index) ?? '') + text);
  }

  appendToolInput(index: number, input: string): void {
    this.touch(index);
    let tool = this.tools.get(index);
    if (!tool) {
      tool = { name: '', inputChunks: [] };
      this.tools.set(index, tool);
    }
    tool.inputChunks.push(input);
  }

  toParts(): MessagePart[] {
    const parts: MessagePart[] = [];
    for (const index of [...this.indices].sort((a, b) => a - b)) {
      const reasoning = this.reasoning.get(index);
      if (reasoning !== undefined) {
        parts.push({ type: 'reasoning', content: reasoning });
      }
      const text = this.text.get(index);
      if (text !== undefined) {
        parts.push({ type: 'text', content: text });
      }
      const tool = this.tools.get(index);
      if (tool) {
        const rawInput = tool.inputChunks.join('');
        let args: unknown = {};
        if (rawInput) {
          try {
            args = JSON.parse(rawInput);
          } catch {
            args = rawInput;
          }
        }
        parts.push({
          type: 'tool_call',
          id: tool.id,
          name: tool.name,
          arguments: args,
        });
      }
    }
    return parts;
  }
}

/**
 * Wrap a stream so that the invocation is completed when the stream ends, and
 * the span (owned by the aws-sdk middleware, not by the invocation) is ended
 * right after.
 */
function wrapStream<TChunk>(
  handler: TelemetryHandler,
  stream: AsyncIterable<TChunk>,
  span: Span,
  invocation: InferenceInvocation,
  onChunk: (chunk: TChunk) => void,
  onEnd: () => void
): AsyncIterable<TChunk> {
  const instrumented = handler.wrapAsyncStream(stream, {
    invocation,
    onChunk,
    onEnd,
  });
  return (async function* () {
    try {
      yield* instrumented;
    } finally {
      span.end();
    }
  })();
}

/**
 * Wrap a `ConverseStream` event stream, accumulating output content, the
 * finish reason and token usage onto the invocation.
 */
export function wrapConverseStream(
  handler: TelemetryHandler,
  stream: AsyncIterable<any>,
  span: Span,
  invocation: InferenceInvocation,
  captureContent: boolean
): AsyncIterable<any> {
  const blocks = new ContentBlocks();
  let role = 'assistant';
  let stopReason: unknown;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let cacheReadTokens: number | undefined;
  let cacheWriteTokens: number | undefined;

  const onChunk = (chunk: any) => {
    if (!isRecord(chunk)) return;
    if (isRecord(chunk.messageStart) && chunk.messageStart.role) {
      role = chunk.messageStart.role;
    }

    if (captureContent && isRecord(chunk.contentBlockStart)) {
      const index = chunk.contentBlockStart.contentBlockIndex ?? 0;
      blocks.touch(index);
      const toolUse = chunk.contentBlockStart.start?.toolUse;
      if (isRecord(toolUse)) {
        blocks.tools.set(index, {
          id: toolUse.toolUseId,
          name: String(toolUse.name ?? ''),
          inputChunks: [],
        });
      }
    }

    if (captureContent && isRecord(chunk.contentBlockDelta)) {
      const index = chunk.contentBlockDelta.contentBlockIndex ?? 0;
      blocks.touch(index);
      const delta = chunk.contentBlockDelta.delta;
      if (isRecord(delta)) {
        if (typeof delta.text === 'string') {
          blocks.appendText(index, delta.text);
        } else if (isRecord(delta.reasoningContent)) {
          if (typeof delta.reasoningContent.text === 'string') {
            blocks.appendReasoning(index, delta.reasoningContent.text);
          }
        } else if (isRecord(delta.toolUse)) {
          blocks.appendToolInput(index, String(delta.toolUse.input ?? ''));
        }
      }
    }

    if (isRecord(chunk.messageStop) && chunk.messageStop.stopReason) {
      stopReason = chunk.messageStop.stopReason;
    }

    const usage = chunk.metadata?.usage;
    if (isRecord(usage)) {
      inputTokens = toInt(usage.inputTokens) ?? inputTokens;
      outputTokens = toInt(usage.outputTokens) ?? outputTokens;
      cacheReadTokens = toInt(usage.cacheReadInputTokens) ?? cacheReadTokens;
      cacheWriteTokens = toInt(usage.cacheWriteInputTokens) ?? cacheWriteTokens;
    }
  };

  const onEnd = () => {
    const finishReason = mapFinishReason(stopReason);
    if (finishReason) invocation.setFinishReasons([finishReason]);
    if (captureContent) {
      const parts = blocks.toParts();
      if (parts.length > 0 || finishReason) {
        invocation.addOutputMessages([
          { role, parts, finish_reason: finishReason ?? 'error' },
        ]);
      }
    }
    invocation.setUsage(
      converseUsage(inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens)
    );
  };

  return wrapStream(handler, stream, span, invocation, onChunk, onEnd);
}

/**
 * Wrap an `InvokeModelWithResponseStream` body, decoding each model-specific
 * JSON chunk and accumulating output content, the finish reason and token
 * usage onto the invocation.
 */
export function wrapInvokeModelStream(
  handler: TelemetryHandler,
  stream: AsyncIterable<any>,
  span: Span,
  invocation: InferenceInvocation,
  captureContent: boolean
): AsyncIterable<any> {
  const blocks = new ContentBlocks();
  const accumulatedText: string[] = [];
  let role = 'assistant';
  let stopReason: unknown;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let cacheReadTokens: number | undefined;
  let cacheWriteTokens: number | undefined;

  const onChunk = (event: any) => {
    const bytes = event?.chunk?.bytes;
    if (!(bytes instanceof Uint8Array)) return;
    const data = parseBody(bytes);
    if (!data) return;

    // Invocation metrics appended by Bedrock to the last chunk of every model.
    const metrics = data['amazon-bedrock-invocationMetrics'];
    if (isRecord(metrics)) {
      inputTokens = toInt(metrics.inputTokenCount) ?? inputTokens;
      outputTokens = toInt(metrics.outputTokenCount) ?? outputTokens;
    }

    // Anthropic Messages format
    switch (data.type) {
      case 'message_start': {
        const message = data.message;
        if (isRecord(message)) {
          if (message.role) role = message.role;
          const usage = message.usage;
          if (isRecord(usage)) {
            inputTokens =
              toInt(firstDefined(usage.input_tokens, usage.inputTokens)) ??
              inputTokens;
            cacheReadTokens =
              toInt(
                firstDefined(
                  usage.cache_read_input_tokens,
                  usage.cacheReadInputTokens
                )
              ) ?? cacheReadTokens;
            cacheWriteTokens =
              toInt(
                firstDefined(
                  usage.cache_creation_input_tokens,
                  usage.cacheWriteInputTokens
                )
              ) ?? cacheWriteTokens;
          }
        }
        break;
      }
      case 'content_block_start': {
        if (!captureContent) break;
        const index = data.index ?? 0;
        blocks.touch(index);
        const block = data.content_block;
        if (!isRecord(block)) break;
        if (block.type === 'tool_use') {
          blocks.tools.set(index, {
            id: block.id,
            name: String(block.name ?? ''),
            inputChunks: [],
          });
        } else if (block.type === 'text' && typeof block.text === 'string') {
          blocks.text.set(index, block.text);
        } else if (
          block.type === 'thinking' ||
          block.type === 'redacted_thinking'
        ) {
          blocks.reasoning.set(index, String(block.thinking || block.data || ''));
        }
        break;
      }
      case 'content_block_delta': {
        const delta = data.delta;
        if (!captureContent || !isRecord(delta)) break;
        const index = data.index ?? 0;
        if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          blocks.appendReasoning(index, delta.thinking);
        } else if (
          delta.type === 'input_json_delta' &&
          typeof delta.partial_json === 'string'
        ) {
          blocks.appendToolInput(index, delta.partial_json);
        } else if (typeof delta.text === 'string') {
          blocks.appendText(index, delta.text);
        } else {
          blocks.touch(index);
        }
        break;
      }
      case 'message_delta': {
        if (isRecord(data.delta) && data.delta.stop_reason) {
          stopReason = data.delta.stop_reason;
        }
        if (isRecord(data.usage)) {
          outputTokens = toInt(data.usage.output_tokens) ?? outputTokens;
        }
        break;
      }
    }

    // Amazon Nova format
    if (isRecord(data.messageStart) && data.messageStart.role) {
      role = data.messageStart.role;
    }
    if (captureContent && isRecord(data.contentBlockDelta)) {
      const delta = data.contentBlockDelta.delta;
      if (isRecord(delta) && typeof delta.text === 'string') {
        blocks.appendText(data.contentBlockDelta.contentBlockIndex ?? 0, delta.text);
      }
    }
    if (isRecord(data.messageStop) && data.messageStop.stopReason) {
      stopReason = data.messageStop.stopReason;
    }
    const novaUsage = data.metadata?.usage;
    if (isRecord(novaUsage)) {
      inputTokens = toInt(novaUsage.inputTokens) ?? inputTokens;
      outputTokens = toInt(novaUsage.outputTokens) ?? outputTokens;
    }

    // Legacy Claude / Titan / Llama / Mistral / Cohere chunks
    const firstOutput =
      Array.isArray(data.outputs) && isRecord(data.outputs[0])
        ? data.outputs[0]
        : undefined;
    const firstGeneration =
      Array.isArray(data.generations) && isRecord(data.generations[0])
        ? data.generations[0]
        : undefined;
    let text: unknown;
    if (typeof data.completion === 'string') {
      text = data.completion;
      stopReason = data.stop_reason ?? stopReason;
    } else if (typeof data.outputText === 'string') {
      text = data.outputText;
      stopReason = data.completionReason ?? stopReason;
    } else if (typeof data.generation === 'string') {
      text = data.generation;
      stopReason = data.stop_reason ?? stopReason;
    } else if (firstOutput) {
      text = firstOutput.text;
      stopReason = firstOutput.stop_reason ?? stopReason;
    } else if (firstGeneration) {
      text = firstGeneration.text;
      stopReason = firstGeneration.finish_reason ?? stopReason;
    } else if (typeof data.text === 'string' && data.type === undefined) {
      text = data.text;
      if (data.is_finished) stopReason = 'COMPLETE';
    }
    if (typeof data.finish_reason === 'string') {
      // Cohere Command R `stream-end` event
      stopReason = data.finish_reason;
    }
    if (captureContent && typeof text === 'string') {
      accumulatedText.push(text);
    }
  };

  const onEnd = () => {
    const finishReason = mapFinishReason(stopReason);
    if (finishReason) invocation.setFinishReasons([finishReason]);
    invocation.setUsage({
      inputTokenCount: inputTokens,
      outputTokenCount: outputTokens,
      cacheReadTokenCount: cacheReadTokens,
      cacheWriteTokenCount: cacheWriteTokens,
    });

    if (captureContent) {
      let parts: MessagePart[] = [];
      if (!blocks.isEmpty) {
        parts = blocks.toParts();
      } else if (accumulatedText.length > 0) {
        parts = [{ type: 'text', content: accumulatedText.join('') }];
      }
      if (parts.length > 0 || finishReason) {
        invocation.addOutputMessages([
          { role, parts, finish_reason: finishReason ?? 'error' },
        ]);
      }
    }
  };

  return wrapStream(handler, stream, span, invocation, onChunk, onEnd);
}
