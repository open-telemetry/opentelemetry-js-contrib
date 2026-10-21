/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CallbackHandlerMethods } from '@langchain/core/callbacks/base';
import type { CallbackManager } from '@langchain/core/callbacks/manager';
import { context, type DiagLogger } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import type {
  TelemetryHandler,
  ToolInvocation,
} from '@opentelemetry/genai-util';
import { isRecord } from './content';
import { ownValue } from './internal-workflows';
import { ATTR_GEN_AI_TOOL_CALL_ID } from './semconv';

interface ToolRun {
  runId: string;
  invocation: ToolInvocation;
  callId: string | undefined;
  diag: DiagLogger;
}

interface CallbackInvocation {
  token: symbol;
  runId?: string;
}

// Run IDs are a fallback when no parent invocation identity is inherited.
const runs = new Map<symbol, ToolRun>();
const runTokens = new Map<string, symbol>();
const MAX_PENDING_TOOL_RUNS = 1000;
const handlers = new WeakSet<object>();
const parentInvocations = new WeakMap<object, CallbackInvocation>();

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
    run.invocation.abandon();
  } catch {
    run.diag.warn('LangChain: could not end evicted tool telemetry');
  }
}

/** Register on an invocation's copied manager, not user collections. */
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
  const invocation: CallbackInvocation = { token: Symbol() };
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
 * Migrate the donation's tool start/end/error and parent-run bookkeeping.
 * Other callback operation types remain owned by their existing instrumentation.
 */
function createToolCallbacks(
  telemetry: () => TelemetryHandler | undefined,
  getDiag: () => DiagLogger,
  invocation: CallbackInvocation,
  parentInvocation: CallbackInvocation | undefined
): CallbackHandlerMethods {
  const { token } = invocation;
  const end = (output?: unknown, failure?: { error: unknown }) => {
    const run = runs.get(token);
    if (!run) return;
    const { diag, invocation: tool } = run;
    removeRun(token, run);
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
        const parentToken =
          parentInvocation && parentInvocation.runId === parentRunId
            ? parentInvocation.token
            : parentRunId
              ? runTokens.get(parentRunId)
              : undefined;
        const parent =
          (parentToken
            ? runs.get(parentToken)?.invocation.getContext()
            : undefined) ?? active;
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
          parentContext: parent,
        });
        runs.set(token, {
          runId,
          diag,
          invocation: tool,
          callId: toolCallId,
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
