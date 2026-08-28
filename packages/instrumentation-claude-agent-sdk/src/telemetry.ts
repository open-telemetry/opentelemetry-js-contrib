/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { performance } from 'perf_hooks';

import {
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type Context,
  type DiagLogger,
  type Histogram,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';

import { ContentCapture, safeJsonStringify } from './content';
import type {
  HookCallback,
  HookCallbackMatcher,
  HookEvent,
  Options,
  PostToolUseFailureHookInput,
  PostToolUseHookInput,
  PreToolUseHookInput,
  SDKMessage,
  SDKResultError,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage,
} from './internal-types';
import {
  ATTR_GEN_AI_AGENT_DESCRIPTION,
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_TYPE,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
  GEN_AI_OUTPUT_TYPE_VALUE_JSON,
  GEN_AI_TOOL_TYPE_VALUE_EXTENSION,
} from './semconv';

const DEFAULT_AGENT_NAME = 'Claude Code';
const ABANDONED_ERROR_TYPE = 'abandoned';
const CANCELLED_ERROR_TYPE = 'cancelled';
const TOOL_EXECUTION_ERROR_TYPE = 'tool_execution_error';

export interface InvocationInfo {
  agentName: string;
  configuredModel?: string;
  attributes: Attributes;
  contentCapture?: ContentCapture;
}

export function getInvocationInfo({
  prompt,
  options,
  captureMessageContent,
  diag,
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options: Options | undefined;
  captureMessageContent: boolean;
  diag: DiagLogger;
}): InvocationInfo {
  const agentName = options?.agent ?? DEFAULT_AGENT_NAME;
  const attributes: Attributes = {
    [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT,
    [ATTR_GEN_AI_AGENT_NAME]: agentName,
  };
  const description = options?.agents?.[agentName]?.description;
  if (description) {
    attributes[ATTR_GEN_AI_AGENT_DESCRIPTION] = description;
  }
  if (options?.model) {
    attributes[ATTR_GEN_AI_REQUEST_MODEL] = options.model;
  }
  const conversationId = options?.resume ?? options?.sessionId;
  if (conversationId) {
    attributes[ATTR_GEN_AI_CONVERSATION_ID] = conversationId;
  }
  if (options?.outputFormat) {
    attributes[ATTR_GEN_AI_OUTPUT_TYPE] = GEN_AI_OUTPUT_TYPE_VALUE_JSON;
  }

  const contentCapture = captureMessageContent
    ? new ContentCapture(prompt, diag)
    : undefined;
  if (contentCapture) {
    Object.assign(attributes, contentCapture.getAttributes(options));
  }

  return {
    agentName,
    configuredModel: options?.model,
    attributes,
    contentCapture,
  };
}

export function isSystemInitMessage(
  message: SDKMessage
): message is SDKSystemMessage {
  return message.type === 'system' && message.subtype === 'init';
}

export function isResultMessage(
  message: SDKMessage
): message is SDKResultMessage {
  return message.type === 'result';
}

export function getSystemAttributes(
  message: SDKSystemMessage,
  configuredModel: string | undefined
): Attributes {
  const attributes: Attributes = {
    [ATTR_GEN_AI_CONVERSATION_ID]: message.session_id,
  };
  if (!configuredModel) {
    attributes[ATTR_GEN_AI_REQUEST_MODEL] = message.model;
  }
  return attributes;
}

export function getResultAttributes(message: SDKResultMessage): Attributes {
  const attributes: Attributes = {
    [ATTR_GEN_AI_CONVERSATION_ID]: message.session_id,
    [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [
      message.stop_reason ??
        (message.subtype === 'success' ? 'stop' : message.subtype),
    ],
  };

  const modelUsage = Object.values(message.modelUsage);
  if (modelUsage.length > 0) {
    attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS] = modelUsage.reduce(
      (total, usage) => total + usage.inputTokens,
      0
    );
    attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS] = modelUsage.reduce(
      (total, usage) => total + usage.outputTokens,
      0
    );
    attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS] = modelUsage.reduce(
      (total, usage) => total + usage.cacheReadInputTokens,
      0
    );
    attributes[ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS] = modelUsage.reduce(
      (total, usage) => total + usage.cacheCreationInputTokens,
      0
    );
  } else {
    attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS] = message.usage.input_tokens;
    attributes[ATTR_GEN_AI_USAGE_OUTPUT_TOKENS] = message.usage.output_tokens;
    attributes[ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS] =
      message.usage.cache_read_input_tokens;
    attributes[ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS] =
      message.usage.cache_creation_input_tokens;
  }
  return attributes;
}

export function getResultError(message: SDKResultError): {
  type: string;
  message: string;
} {
  return {
    type: message.subtype,
    message:
      message.errors.length > 0 ? message.errors.join('; ') : message.subtype,
  };
}

interface ToolSpanState {
  span: Span;
  startedAt: number;
  attributes: Attributes;
}

export class ToolSpanTracker {
  private readonly _spans = new Map<string, ToolSpanState>();
  private _startedCount = 0;
  private _closed = false;

  constructor(
    private readonly _tracer: Tracer,
    private readonly _parentContext: Context,
    private readonly _agentName: string,
    private readonly _captureMessageContent: boolean,
    private readonly _duration: Histogram,
    private readonly _diag: DiagLogger
  ) {}

  get startedCount(): number {
    return this._startedCount;
  }

  start(input: PreToolUseHookInput): void {
    if (this._closed) {
      return;
    }
    this._endAbandoned(input.tool_use_id);
    const attributes: Attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
      [ATTR_GEN_AI_TOOL_NAME]: input.tool_name,
      [ATTR_GEN_AI_TOOL_TYPE]: GEN_AI_TOOL_TYPE_VALUE_EXTENSION,
      [ATTR_GEN_AI_TOOL_CALL_ID]: input.tool_use_id,
      [ATTR_GEN_AI_AGENT_NAME]: this._agentName,
    };
    const span = this._tracer.startSpan(
      `${GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL} ${input.tool_name}`,
      { kind: SpanKind.INTERNAL, attributes },
      this._parentContext
    );
    if (this._captureMessageContent) {
      const argumentsValue = safeJsonStringify(input.tool_input);
      if (argumentsValue !== undefined) {
        span.setAttribute(ATTR_GEN_AI_TOOL_CALL_ARGUMENTS, argumentsValue);
      }
    }
    this._spans.set(input.tool_use_id, {
      span,
      attributes,
      startedAt: performance.now(),
    });
    this._startedCount += 1;
  }

  succeed(input: PostToolUseHookInput): void {
    const state = this._take(input.tool_use_id);
    if (!state) {
      return;
    }
    if (this._captureMessageContent) {
      const result = safeJsonStringify(input.tool_response);
      if (result !== undefined) {
        state.span.setAttribute(ATTR_GEN_AI_TOOL_CALL_RESULT, result);
      }
    }
    this._end(state);
  }

  fail(input: PostToolUseFailureHookInput): void {
    const state = this._take(input.tool_use_id);
    if (!state) {
      return;
    }
    const errorType = input.is_interrupt
      ? CANCELLED_ERROR_TYPE
      : TOOL_EXECUTION_ERROR_TYPE;
    state.span.setAttribute(ATTR_ERROR_TYPE, errorType);
    state.span.setStatus({ code: SpanStatusCode.ERROR, message: input.error });
    state.span.recordException(new Error(input.error));
    this._end(state, errorType);
  }

  close(): void {
    this._closed = true;
    for (const toolUseId of this._spans.keys()) {
      this._endAbandoned(toolUseId);
    }
  }

  private _take(toolUseId: string): ToolSpanState | undefined {
    const state = this._spans.get(toolUseId);
    this._spans.delete(toolUseId);
    return state;
  }

  private _endAbandoned(toolUseId: string): void {
    const state = this._take(toolUseId);
    if (!state) {
      return;
    }
    state.span.setAttribute(ATTR_ERROR_TYPE, ABANDONED_ERROR_TYPE);
    state.span.setStatus({
      code: SpanStatusCode.ERROR,
      message: 'Tool execution ended without a completion hook',
    });
    this._end(state, ABANDONED_ERROR_TYPE);
  }

  private _end(state: ToolSpanState, errorType?: string): void {
    state.span.end();
    const attributes = { ...state.attributes };
    delete attributes[ATTR_GEN_AI_OPERATION_NAME];
    delete attributes[ATTR_GEN_AI_TOOL_CALL_ID];
    if (errorType) {
      attributes[ATTR_ERROR_TYPE] = errorType;
    }
    this._duration.record(
      (performance.now() - state.startedAt) / 1000,
      attributes
    );
  }

  createHooks(): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    const preToolUse: HookCallback = async input => {
      try {
        if (input.hook_event_name === 'PreToolUse') {
          this.start(input);
        }
      } catch (error) {
        this._diag.debug('failed to start Claude Agent SDK tool span', error);
      }
      return {};
    };
    const postToolUse: HookCallback = async input => {
      try {
        if (input.hook_event_name === 'PostToolUse') {
          this.succeed(input);
        }
      } catch (error) {
        this._diag.debug('failed to finish Claude Agent SDK tool span', error);
      }
      return {};
    };
    const postToolUseFailure: HookCallback = async input => {
      try {
        if (input.hook_event_name === 'PostToolUseFailure') {
          this.fail(input);
        }
      } catch (error) {
        this._diag.debug('failed to fail Claude Agent SDK tool span', error);
      }
      return {};
    };
    return {
      PreToolUse: [{ hooks: [preToolUse] }],
      PostToolUse: [{ hooks: [postToolUse] }],
      PostToolUseFailure: [{ hooks: [postToolUseFailure] }],
    };
  }
}

export function mergeToolHooks(
  options: Options | undefined,
  tracker: ToolSpanTracker
): Options {
  const hooks = { ...(options?.hooks ?? {}) };
  for (const [event, matchers] of Object.entries(tracker.createHooks())) {
    const hookEvent = event as HookEvent;
    hooks[hookEvent] = [...(hooks[hookEvent] ?? []), ...(matchers ?? [])];
  }
  return { ...options, hooks };
}
