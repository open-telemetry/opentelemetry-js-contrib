/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type {
  InferenceInvocation,
  MessagePart,
  TelemetryHandler,
} from '@opentelemetry/genai-util';
import {
  firstDefined,
  isRecord,
  mapFinishReason,
  parseBody,
  toInt,
  tokenUsage,
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
  private readonly indices = new Set<number>();
  readonly text = new Map<number, string>();
  readonly reasoning = new Map<number, string>();
  readonly tools = new Map<number, ToolBlock>();

  touch(index: number): void {
    this.indices.add(index);
  }

  get isEmpty(): boolean {
    return this.indices.size === 0;
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
 * Telemetry accumulated while a stream is consumed. It is flushed onto the
 * invocation when the stream ends and also when it fails, so that usage and
 * partial output received before an error are not lost.
 */
class StreamState {
  readonly blocks = new ContentBlocks();
  /** Text from models that stream plain text chunks instead of content blocks. */
  readonly text: string[] = [];
  role = 'assistant';
  stopReason: unknown;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  cacheReadTokens: number | undefined;
  cacheWriteTokens: number | undefined;

  constructor(readonly captureContent: boolean) {}

  /**
   * Process a Converse stream event. `ConverseStream` and Amazon Nova models
   * invoked through `InvokeModelWithResponseStream` use the same event schema.
   */
  processConverseEvent(event: Record<string, any>): void {
    if (isRecord(event.messageStart) && event.messageStart.role) {
      this.role = event.messageStart.role;
    }

    if (this.captureContent && isRecord(event.contentBlockStart)) {
      const index = event.contentBlockStart.contentBlockIndex ?? 0;
      this.blocks.touch(index);
      const toolUse = event.contentBlockStart.start?.toolUse;
      if (isRecord(toolUse)) {
        this.blocks.tools.set(index, {
          id: toolUse.toolUseId,
          name: String(toolUse.name ?? ''),
          inputChunks: [],
        });
      }
    }

    if (this.captureContent && isRecord(event.contentBlockDelta)) {
      const index = event.contentBlockDelta.contentBlockIndex ?? 0;
      this.blocks.touch(index);
      const delta = event.contentBlockDelta.delta;
      if (isRecord(delta)) {
        if (typeof delta.text === 'string') {
          this.blocks.appendText(index, delta.text);
        } else if (isRecord(delta.reasoningContent)) {
          if (typeof delta.reasoningContent.text === 'string') {
            this.blocks.appendReasoning(index, delta.reasoningContent.text);
          }
        } else if (isRecord(delta.toolUse)) {
          this.blocks.appendToolInput(index, String(delta.toolUse.input ?? ''));
        }
      }
    }

    if (isRecord(event.messageStop) && event.messageStop.stopReason) {
      this.stopReason = event.messageStop.stopReason;
    }

    const usage = event.metadata?.usage;
    if (isRecord(usage)) {
      this.inputTokens = toInt(usage.inputTokens) ?? this.inputTokens;
      this.outputTokens = toInt(usage.outputTokens) ?? this.outputTokens;
      this.cacheReadTokens =
        toInt(
          firstDefined(
            usage.cacheReadInputTokens,
            usage.cacheReadInputTokenCount
          )
        ) ?? this.cacheReadTokens;
      this.cacheWriteTokens =
        toInt(
          firstDefined(
            usage.cacheWriteInputTokens,
            usage.cacheWriteInputTokenCount
          )
        ) ?? this.cacheWriteTokens;
    }
  }

  flush(invocation: InferenceInvocation): void {
    const finishReason = mapFinishReason(this.stopReason);
    if (finishReason) invocation.setFinishReasons([finishReason]);
    invocation.setUsage(
      tokenUsage(
        this.inputTokens,
        this.outputTokens,
        this.cacheReadTokens,
        this.cacheWriteTokens
      )
    );

    if (this.captureContent) {
      let parts: MessagePart[] = [];
      if (!this.blocks.isEmpty) {
        parts = this.blocks.toParts();
      } else if (this.text.length > 0) {
        parts = [{ type: 'text', content: this.text.join('') }];
      }
      if (parts.length > 0 || finishReason) {
        invocation.addOutputMessages([
          { role: this.role, parts, finish_reason: finishReason ?? 'error' },
        ]);
      }
    }
  }
}

/**
 * Wrap a stream so that the invocation (and with it, its span) is completed when
 * the stream ends, fails, or the caller stops reading it. The accumulated state
 * is flushed onto the invocation in every case.
 */
function wrapStream<TChunk>(
  handler: TelemetryHandler,
  stream: AsyncIterable<TChunk>,
  invocation: InferenceInvocation,
  state: StreamState,
  onChunk: (chunk: TChunk) => void
): AsyncIterable<TChunk> {
  const flush = () => state.flush(invocation);
  return handler.wrapAsyncStream(stream, {
    invocation,
    onChunk,
    onEnd: flush,
    onError: flush,
  });
}

/**
 * Wrap a `ConverseStream` event stream, accumulating output content, the
 * finish reason and token usage onto the invocation.
 */
export function wrapConverseStream(
  handler: TelemetryHandler,
  stream: AsyncIterable<any>,
  invocation: InferenceInvocation,
  captureContent: boolean
): AsyncIterable<any> {
  const state = new StreamState(captureContent);
  return wrapStream(handler, stream, invocation, state, chunk => {
    if (isRecord(chunk)) state.processConverseEvent(chunk);
  });
}

/**
 * Wrap an `InvokeModelWithResponseStream` body, decoding each model-specific
 * JSON chunk and accumulating output content, the finish reason and token
 * usage onto the invocation.
 */
export function wrapInvokeModelStream(
  handler: TelemetryHandler,
  stream: AsyncIterable<any>,
  invocation: InferenceInvocation,
  captureContent: boolean
): AsyncIterable<any> {
  const state = new StreamState(captureContent);
  const { blocks } = state;

  const onChunk = (event: any) => {
    const bytes = event?.chunk?.bytes;
    if (!(bytes instanceof Uint8Array)) return;
    const data = parseBody(bytes);
    if (!data) return;

    // Invocation metrics appended by Bedrock to the last chunk of every model.
    const metrics = data['amazon-bedrock-invocationMetrics'];
    if (isRecord(metrics)) {
      state.inputTokens = toInt(metrics.inputTokenCount) ?? state.inputTokens;
      state.outputTokens =
        toInt(metrics.outputTokenCount) ?? state.outputTokens;
      state.cacheReadTokens =
        toInt(metrics.cacheReadInputTokenCount) ?? state.cacheReadTokens;
      state.cacheWriteTokens =
        toInt(metrics.cacheWriteInputTokenCount) ?? state.cacheWriteTokens;
    }

    // Anthropic Messages format
    switch (data.type) {
      case 'message_start': {
        const message = data.message;
        if (isRecord(message)) {
          if (message.role) state.role = message.role;
          const usage = message.usage;
          if (isRecord(usage)) {
            state.inputTokens =
              toInt(firstDefined(usage.input_tokens, usage.inputTokens)) ??
              state.inputTokens;
            state.cacheReadTokens =
              toInt(
                firstDefined(
                  usage.cache_read_input_tokens,
                  usage.cacheReadInputTokens
                )
              ) ?? state.cacheReadTokens;
            state.cacheWriteTokens =
              toInt(
                firstDefined(
                  usage.cache_creation_input_tokens,
                  usage.cacheWriteInputTokens
                )
              ) ?? state.cacheWriteTokens;
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
          blocks.reasoning.set(
            index,
            String(block.thinking || block.data || '')
          );
        }
        break;
      }
      case 'content_block_delta': {
        const delta = data.delta;
        if (!captureContent || !isRecord(delta)) break;
        const index = data.index ?? 0;
        if (
          delta.type === 'thinking_delta' &&
          typeof delta.thinking === 'string'
        ) {
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
          state.stopReason = data.delta.stop_reason;
        }
        if (isRecord(data.usage)) {
          state.outputTokens =
            toInt(data.usage.output_tokens) ?? state.outputTokens;
        }
        break;
      }
    }

    // Amazon Nova format (the Converse event schema)
    state.processConverseEvent(data);

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
      state.stopReason = data.stop_reason ?? state.stopReason;
    } else if (typeof data.outputText === 'string') {
      text = data.outputText;
      state.stopReason = data.completionReason ?? state.stopReason;
    } else if (typeof data.generation === 'string') {
      text = data.generation;
      state.stopReason = data.stop_reason ?? state.stopReason;
    } else if (firstOutput) {
      text = firstOutput.text;
      state.stopReason = firstOutput.stop_reason ?? state.stopReason;
    } else if (firstGeneration) {
      text = firstGeneration.text;
      state.stopReason = firstGeneration.finish_reason ?? state.stopReason;
    } else if (typeof data.text === 'string' && data.type === undefined) {
      text = data.text;
      if (data.is_finished) state.stopReason = 'COMPLETE';
    }
    if (typeof data.finish_reason === 'string') {
      // Cohere Command R `stream-end` event
      state.stopReason = data.finish_reason;
    }
    if (captureContent && typeof text === 'string') {
      state.text.push(text);
    }
  };

  return wrapStream(handler, stream, invocation, state, onChunk);
}
