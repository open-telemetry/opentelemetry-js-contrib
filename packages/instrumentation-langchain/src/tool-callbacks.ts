/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  BaseCallbackHandler,
  CallbackHandlerMethods,
} from '@langchain/core/callbacks/base';
import type { CallbackManager } from '@langchain/core/callbacks/manager';
import {
  context,
  trace,
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type Context,
  type DiagLogger,
  type Histogram,
  type HrTime,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import {
  hrTime,
  hrTimeDuration,
  hrTimeToSeconds,
  isTracingSuppressed,
} from '@opentelemetry/core';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { isRecord } from './content';
import { ownValue } from './internal-workflows';
import {
  ATTR_GEN_AI_CONVERSATION_ID,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_TOOL_DESCRIPTION,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
} from './semconv';

interface ToolTelemetry {
  tracer: Tracer;
  duration: Histogram | undefined;
  capture: boolean;
}

interface ToolRun {
  runId: string;
  span: Span;
  context: Context;
  startTime: HrTime;
  metricAttributes: Attributes;
  callId: string | undefined;
  duration: Histogram | undefined;
  capture: boolean;
  diag: DiagLogger;
}

// Run IDs are only a parent lookup. Completion uses an invocation's token.
const runs = new Map<symbol, ToolRun>();
const runTokens = new Map<string, symbol>();
const MAX_PENDING_TOOL_RUNS = 1000;
const handlers = new WeakSet<object>();

function removeRun(token: symbol, run: ToolRun) {
  runs.delete(token);
  if (runTokens.get(run.runId) === token) runTokens.delete(run.runId);
}

function evictOldestRun() {
  if (runs.size <= MAX_PENDING_TOOL_RUNS) return;
  const oldest = runs.entries().next();
  if (oldest.done) return;
  const [token, run] = oldest.value;
  removeRun(token, run);
  run.diag.warn('LangChain: pending tool limit reached, releasing oldest run');
  try {
    // Eviction is not an observed completion, so do not record a duration.
    run.span.end();
  } catch {
    run.diag.warn('LangChain: could not end evicted tool telemetry');
  }
}

/** Register on an invocation's copied manager, not user collections. */
export function addToolHandler(
  configured: CallbackManager,
  handler: BaseCallbackHandler
): CallbackManager {
  handlers.add(handler);
  for (const callback of configured.handlers) {
    if (handlers.has(callback)) configured.removeHandler(callback);
  }
  // An uninstrumented child must not complete its parent's invocation.
  configured.addHandler(handler, false);
  return configured;
}

function content(value: unknown, key: 'input' | 'output'): string | undefined {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      // LangChain serializes non-string arguments before invoking callbacks.
      if (key === 'input' || isRecord(parsed)) value = parsed;
    } catch {
      // A plain text tool argument or result is not serialized JSON.
    }
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return undefined;
  // Check the JSON shape after toJSON, without serializing SDK objects twice.
  return serialized[0] === '{' ? serialized : `{"${key}":${serialized}}`;
}

/**
 * Migrate the donation's tool start/end/error and parent-run bookkeeping.
 * Other callback operation types remain owned by their existing instrumentation.
 */
export function createToolCallbacks(
  telemetry: () => ToolTelemetry | undefined,
  getDiag: () => DiagLogger
): CallbackHandlerMethods {
  const token = Symbol();
  const end = (output?: unknown, failure?: { error: unknown }) => {
    const run = runs.get(token);
    if (!run) return;
    const { diag } = run;
    removeRun(token, run);
    const endTime = hrTime();
    try {
      if (failure) {
        let errorType = '_OTHER';
        try {
          const name =
            failure.error instanceof Error ? failure.error.name : undefined;
          if (typeof name === 'string' && name) errorType = name;
        } catch {
          diag.warn('LangChain: could not classify tool failure');
        }
        run.span.setStatus({ code: SpanStatusCode.ERROR });
        run.span.setAttribute(ATTR_ERROR_TYPE, errorType);
        run.metricAttributes[ATTR_ERROR_TYPE] = errorType;
      } else {
        if (!run.callId && ownValue(output, 'lc_direct_tool_output') === true) {
          const callId = ownValue(output, 'tool_call_id');
          if (typeof callId === 'string' && callId)
            run.span.setAttribute(ATTR_GEN_AI_TOOL_CALL_ID, callId);
        }
        if (run.capture) {
          const result = content(output, 'output');
          if (result !== undefined)
            run.span.setAttribute(ATTR_GEN_AI_TOOL_CALL_RESULT, result);
        }
      }
    } catch {
      diag.warn('LangChain: could not extract tool result telemetry');
    } finally {
      try {
        run.duration?.record(
          hrTimeToSeconds(hrTimeDuration(run.startTime, endTime)),
          run.metricAttributes,
          run.context
        );
      } catch {
        diag.warn('LangChain: could not record tool duration');
      }
      try {
        run.span.end(endTime);
      } catch {
        diag.warn('LangChain: could not end tool telemetry');
      }
    }
  };
  return {
    handleToolStart(
      ...args: Parameters<
        NonNullable<CallbackHandlerMethods['handleToolStart']>
      >
    ) {
      const [serialized, input, runId, parentRunId, , metadata, runName] = args;
      // Core 1.1.28 added toolCallId as argument 8. Using slice also compiles
      // against older seven-argument types, where we use the final ToolMessage.
      const optionalId: unknown = args.slice(7)[0];
      const toolCallId =
        typeof optionalId === 'string' ? optionalId : undefined;
      const active = context.active();
      if (isTracingSuppressed(active)) return;
      const diag = getDiag();
      try {
        const current = telemetry();
        if (!current) return;
        const serializedName = ownValue(serialized, 'name');
        const name =
          typeof serializedName === 'string'
            ? serializedName
            : (runName ?? serialized.id[serialized.id.length - 1]);
        const description = ownValue(serialized, 'description');
        const attributes: Attributes = {
          [ATTR_GEN_AI_OPERATION_NAME]:
            GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
        };
        const metricAttributes: Attributes = {};
        if (typeof name === 'string') {
          attributes[ATTR_GEN_AI_TOOL_NAME] = name;
          metricAttributes[ATTR_GEN_AI_TOOL_NAME] = name;
        }
        if (typeof description === 'string')
          attributes[ATTR_GEN_AI_TOOL_DESCRIPTION] = description;
        const className = serialized.id[serialized.id.length - 1];
        if (
          className === 'DynamicTool' ||
          className === 'DynamicStructuredTool'
        ) {
          attributes[ATTR_GEN_AI_TOOL_TYPE] = GEN_AI_TOOL_TYPE_VALUE_FUNCTION;
          metricAttributes[ATTR_GEN_AI_TOOL_TYPE] =
            GEN_AI_TOOL_TYPE_VALUE_FUNCTION;
        }
        if (toolCallId) attributes[ATTR_GEN_AI_TOOL_CALL_ID] = toolCallId;
        const conversation = ['session_id', 'thread_id', 'conversation_id']
          .map(key => ownValue(metadata, key))
          .find(value => typeof value === 'string' && value.length > 0);
        if (typeof conversation === 'string')
          attributes[ATTR_GEN_AI_CONVERSATION_ID] = conversation;
        if (current.capture) {
          const arguments_ = content(input, 'input');
          if (arguments_ !== undefined)
            attributes[ATTR_GEN_AI_TOOL_CALL_ARGUMENTS] = arguments_;
        }
        const parentToken = parentRunId
          ? runTokens.get(parentRunId)
          : undefined;
        const parent =
          (parentToken ? runs.get(parentToken)?.context : undefined) ?? active;
        const startTime = hrTime();
        const span = current.tracer.startSpan(
          name
            ? `${GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL} ${name}`
            : GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
          { kind: SpanKind.INTERNAL, attributes, startTime },
          parent
        );
        runs.set(token, {
          runId,
          duration: current.duration,
          capture: current.capture,
          diag,
          span,
          startTime,
          metricAttributes,
          callId: toolCallId,
          context: trace.setSpan(parent, span),
        });
        runTokens.set(runId, token);
        evictOldestRun();
      } catch {
        diag.warn('LangChain: could not start tool telemetry');
      }
    },
    handleToolEnd(output: unknown) {
      end(output);
    },
    handleToolError(error: unknown) {
      end(undefined, { error });
    },
  };
}
