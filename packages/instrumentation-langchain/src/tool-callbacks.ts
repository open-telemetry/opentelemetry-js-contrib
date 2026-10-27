/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CallbackHandlerMethods } from '@langchain/core/callbacks/base';
import type {
  CallbackManager,
  CallbackManagerForToolRun,
} from '@langchain/core/callbacks/manager';
import { context, type Context, type DiagLogger } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import {
  ATTR_GEN_AI_TOOL_CALL_ID,
  type TelemetryHandler,
  type ToolInvocation,
} from '@opentelemetry/genai-util';
import { isRecord } from './content';
import { ownValue } from './internal-workflows';

interface ToolRun {
  runId: string;
  invocation: ToolInvocation;
  callId: string | undefined;
  diag: DiagLogger;
}

/**
 * Object identity distinguishes executions even when LangChain reuses a run ID.
 * Inherited marker handlers share this object to find the parent's active context.
 */
interface CallbackInvocation {
  runId?: string;
  context?: Context;
}

let pendingRuns = 0;
// Run IDs are a fallback when no parent invocation identity is inherited.
const runInvocations = new Map<string, CallbackInvocation>();
const MAX_PENDING_TOOL_RUNS = 1000;
const handlers = new WeakSet<object>();
const parentInvocations = new WeakMap<object, CallbackInvocation>();

export function getToolContext(
  manager: CallbackManagerForToolRun | undefined
): Context | undefined {
  for (const handler of manager?.handlers ?? []) {
    const invocation = parentInvocations.get(handler);
    if (invocation && invocation.runId === manager?.runId)
      return invocation.context;
  }
  return undefined;
}

/**
 * Registers one tool execution on a copied manager, leaving user callbacks intact.
 *
 * @param configured The SDK manager's invocation-local copy, modified in place.
 * @param manager CallbackManager constructor from the same loaded SDK module copy.
 * @param telemetry Resolves the enabled instrumentation's handler at tool start.
 * @param getDiag Resolves the logger retained for the lifetime of the tool run.
 */
export function addToolCallbacks(
  configured: CallbackManager,
  manager: typeof CallbackManager,
  telemetry: () => TelemetryHandler | undefined,
  getDiag: () => DiagLogger
): CallbackManager {
  let parentInvocation: CallbackInvocation | undefined;
  for (const callback of configured.handlers) {
    parentInvocation = parentInvocations.get(callback) ?? parentInvocation;
    if (handlers.has(callback)) configured.removeHandler(callback);
  }
  const invocation: CallbackInvocation = {};
  const handler = manager.fromHandlers(
    createToolCallbacks(telemetry, getDiag, invocation, parentInvocation)
  ).handlers[0];
  handler.name = 'opentelemetry_langchain_tools';
  handler.awaitHandlers = true;
  handlers.add(handler);
  // An uninstrumented child must not complete its parent's invocation.
  configured.addHandler(handler, false);
  // The SDK preserves this inert identity through getChild() and copy().
  const parentHandler = manager.fromHandlers({}).handlers[0];
  parentHandler.name = 'opentelemetry_langchain_tool_parent';
  handlers.add(parentHandler);
  parentInvocations.set(parentHandler, invocation);
  configured.addHandler(parentHandler, true);
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
 * Creates tool start/end/error callbacks with state scoped to one SDK execution.
 * Late or repeated completions cannot finish another execution that reuses its ID.
 *
 * @param telemetry Resolves telemetry at tool start; undefined skips tracing.
 * @param getDiag Resolves the logger captured at start and used through completion.
 * @param invocation This execution's identity, shared with inherited marker
 * handlers. Its context is set for a tracked run and cleared on completion.
 * @param parentInvocation Parent identity inherited through getChild() or copy().
 * It takes precedence over run-ID lookup when its run ID matches parentRunId.
 */
function createToolCallbacks(
  telemetry: () => TelemetryHandler | undefined,
  getDiag: () => DiagLogger,
  invocation: CallbackInvocation,
  parentInvocation: CallbackInvocation | undefined
): CallbackHandlerMethods {
  let activeRun: ToolRun | undefined;
  const end = (output?: unknown, failure?: { error: unknown }) => {
    const run = activeRun;
    if (!run) return;
    activeRun = undefined;
    invocation.context = undefined;
    pendingRuns--;
    if (runInvocations.get(run.runId) === invocation)
      runInvocations.delete(run.runId);
    const { diag, invocation: tool } = run;
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
        tool.fail({ errorType });
      } else {
        if (!run.callId && ownValue(output, 'lc_direct_tool_output') === true) {
          const callId = ownValue(output, 'tool_call_id');
          if (typeof callId === 'string' && callId)
            tool.setAttribute(ATTR_GEN_AI_TOOL_CALL_ID, callId);
        }
        if (tool.shouldCaptureContent()) {
          const result = content(output, 'output');
          if (result !== undefined) tool.setResult(result);
        }
      }
    } catch {
      diag.warn('LangChain: could not extract tool result telemetry');
    } finally {
      try {
        tool.stop();
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
      invocation.runId = runId;
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
        if (pendingRuns >= MAX_PENDING_TOOL_RUNS) {
          diag.warn(
            'LangChain: pending tool limit reached, skipping new tool telemetry'
          );
          return;
        }
        const serializedName = ownValue(serialized, 'name');
        const name =
          typeof serializedName === 'string'
            ? serializedName
            : (runName ?? serialized.id[serialized.id.length - 1]);
        const description = ownValue(serialized, 'description');
        const className = serialized.id[serialized.id.length - 1];
        const conversation = ['session_id', 'thread_id', 'conversation_id']
          .map(key => ownValue(metadata, key))
          .find(value => typeof value === 'string' && value.length > 0);
        const parent =
          parentInvocation && parentInvocation.runId === parentRunId
            ? parentInvocation
            : parentRunId
              ? runInvocations.get(parentRunId)
              : undefined;
        const tool = current.startTool({
          toolName: name,
          toolDescription:
            typeof description === 'string' ? description : undefined,
          toolType:
            className === 'DynamicTool' || className === 'DynamicStructuredTool'
              ? 'function'
              : undefined,
          toolCallId,
          conversationId:
            typeof conversation === 'string' ? conversation : undefined,
          toolArguments: current.shouldCaptureContent()
            ? content(input, 'input')
            : undefined,
          parentContext: parent?.context ?? active,
        });
        invocation.context = tool.getContext();
        activeRun = {
          runId,
          diag,
          invocation: tool,
          callId: toolCallId,
        };
        runInvocations.set(runId, invocation);
        pendingRuns++;
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
