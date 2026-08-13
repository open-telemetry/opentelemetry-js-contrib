/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-expect-error -- TypeScript 5.0 misclassifies erased imports from ESM-only packages as runtime requires.
import type * as ClaudeAgentSDK from '@anthropic-ai/claude-agent-sdk';
import {
  SpanKind,
  SpanStatusCode,
  type Context,
  type DiagLogger,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
} from './semconv';

import { safeJsonStringify } from './message-processor';

const TOOL_TYPE_EXTENSION = 'extension';
const ABANDONED_ERROR_TYPE = 'abandoned';
const TOOL_EXECUTION_ERROR_TYPE = 'tool_execution_error';

export class ToolSpanTracker {
  private readonly _inFlightSpans = new Map<string, Span>();

  constructor(
    private readonly _tracer: Tracer,
    private readonly _parentContext: Context,
    private readonly _agentName: string,
    private readonly _captureMessageContent: boolean
  ) {}

  startToolSpan(input: ClaudeAgentSDK.PreToolUseHookInput): void {
    this._endAbandonedSpan(input.tool_use_id);

    const attributes = {
      [ATTR_GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
      [ATTR_GEN_AI_TOOL_NAME]: input.tool_name,
      [ATTR_GEN_AI_TOOL_TYPE]: TOOL_TYPE_EXTENSION,
      [ATTR_GEN_AI_TOOL_CALL_ID]: input.tool_use_id,
      [ATTR_GEN_AI_AGENT_NAME]: this._agentName,
    };
    const span = this._tracer.startSpan(
      `${GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL} ${input.tool_name}`,
      {
        kind: SpanKind.INTERNAL,
        attributes,
      },
      this._parentContext
    );

    if (this._captureMessageContent) {
      const serializedInput = safeJsonStringify(input.tool_input);
      if (serializedInput !== undefined) {
        span.setAttribute(ATTR_GEN_AI_TOOL_CALL_ARGUMENTS, serializedInput);
      }
    }

    this._inFlightSpans.set(input.tool_use_id, span);
  }

  endToolSpan(input: ClaudeAgentSDK.PostToolUseHookInput): void {
    const span = this._takeSpan(input.tool_use_id);
    if (!span) {
      return;
    }

    if (this._captureMessageContent) {
      const serializedResult = safeJsonStringify(input.tool_response);
      if (serializedResult !== undefined) {
        span.setAttribute(ATTR_GEN_AI_TOOL_CALL_RESULT, serializedResult);
      }
    }
    span.end();
  }

  endToolSpanWithError(
    input: ClaudeAgentSDK.PostToolUseFailureHookInput
  ): void {
    const span = this._takeSpan(input.tool_use_id);
    if (!span) {
      return;
    }

    span.setAttribute(ATTR_ERROR_TYPE, TOOL_EXECUTION_ERROR_TYPE);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: input.error,
    });
    span.recordException(new Error(input.error));
    span.end();
  }

  endAllInFlight(): void {
    for (const [toolUseId] of this._inFlightSpans) {
      this._endAbandonedSpan(toolUseId);
    }
  }

  private _takeSpan(toolUseId: string): Span | undefined {
    const span = this._inFlightSpans.get(toolUseId);
    this._inFlightSpans.delete(toolUseId);
    return span;
  }

  private _endAbandonedSpan(toolUseId: string): void {
    const span = this._takeSpan(toolUseId);
    if (!span) {
      return;
    }
    span.setAttribute(ATTR_ERROR_TYPE, ABANDONED_ERROR_TYPE);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message:
        'Tool execution did not complete before the agent invocation ended',
    });
    span.end();
  }
}

export function mergeToolHooks({
  options,
  toolTracker,
  diag,
}: {
  options: ClaudeAgentSDK.Options | undefined;
  toolTracker: ToolSpanTracker;
  diag: DiagLogger;
}): ClaudeAgentSDK.Options {
  const existingHooks = options?.hooks ?? {};
  const instrumentationHooks = createToolHooks(toolTracker, diag);
  const hooks: NonNullable<ClaudeAgentSDK.Options['hooks']> = {
    ...existingHooks,
  };

  for (const [event, matchers] of Object.entries(instrumentationHooks)) {
    const hookEvent = event as ClaudeAgentSDK.HookEvent;
    hooks[hookEvent] = [...(hooks[hookEvent] ?? []), ...matchers];
  }

  return { ...options, hooks };
}

function createToolHooks(
  toolTracker: ToolSpanTracker,
  diag: DiagLogger
): Partial<
  Record<ClaudeAgentSDK.HookEvent, ClaudeAgentSDK.HookCallbackMatcher[]>
> {
  const preToolUse: ClaudeAgentSDK.HookCallback = async input => {
    try {
      if (input.hook_event_name === 'PreToolUse') {
        toolTracker.startToolSpan(input);
      }
    } catch (error) {
      diag.debug('error starting Claude Agent SDK tool span', error);
    }
    return {};
  };

  const postToolUse: ClaudeAgentSDK.HookCallback = async input => {
    try {
      if (input.hook_event_name === 'PostToolUse') {
        toolTracker.endToolSpan(input);
      }
    } catch (error) {
      diag.debug('error ending Claude Agent SDK tool span', error);
    }
    return {};
  };

  const postToolUseFailure: ClaudeAgentSDK.HookCallback = async input => {
    try {
      if (input.hook_event_name === 'PostToolUseFailure') {
        toolTracker.endToolSpanWithError(input);
      }
    } catch (error) {
      diag.debug('error failing Claude Agent SDK tool span', error);
    }
    return {};
  };

  return {
    PreToolUse: [{ hooks: [preToolUse] }],
    PostToolUse: [{ hooks: [postToolUse] }],
    PostToolUseFailure: [{ hooks: [postToolUseFailure] }],
  };
}
