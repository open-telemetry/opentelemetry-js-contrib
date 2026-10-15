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
  span: Span;
  context: Context;
  startTime: HrTime;
  metricAttributes: Attributes;
  callId: string | undefined;
  duration: Histogram | undefined;
  capture: boolean;
  diag: DiagLogger;
}

// CJS/ESM handlers share callback run IDs, including nested tool executions.
const runs = new Map<string, ToolRun>();
const handlers = new WeakSet<object>();

/** Register on the manager already copied by the SDK, not user collections. */
export function addToolHandler(
  configured: CallbackManager,
  handler: BaseCallbackHandler
): CallbackManager {
  handlers.add(handler);
  for (const callback of configured.handlers) {
    if (handlers.has(callback)) configured.removeHandler(callback);
  }
  configured.addHandler(handler, true);
  return configured;
}

function content(value: unknown, key: 'input' | 'output'): string | undefined {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (isRecord(parsed)) value = parsed;
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
  const end = (
    runId: string,
    output?: unknown,
    failure?: { error: unknown }
  ) => {
    const run = runs.get(runId);
    if (!run) return;
    const { diag } = run;
    runs.delete(runId);
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
        const parent = parentRunId
          ? (runs.get(parentRunId)?.context ?? active)
          : active;
        const startTime = hrTime();
        const span = current.tracer.startSpan(
          name
            ? `${GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL} ${name}`
            : GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
          { kind: SpanKind.INTERNAL, attributes, startTime },
          parent
        );
        runs.set(runId, {
          duration: current.duration,
          capture: current.capture,
          diag,
          span,
          startTime,
          metricAttributes,
          callId: toolCallId,
          context: trace.setSpan(parent, span),
        });
      } catch {
        diag.warn('LangChain: could not start tool telemetry');
      }
    },
    handleToolEnd(output: unknown, runId) {
      end(runId, output);
    },
    handleToolError(error: unknown, runId) {
      end(runId, undefined, { error });
    },
  };
}
