/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createContextKey,
  isSpanContextValid,
  trace,
  type Context,
  type Span,
} from '@opentelemetry/api';
import type { ActiveAgentRun, ActiveRun } from './internal-types';
import { isRecord } from './utils';

// Private OTel Context key tracking the enclosing BeeAI agent run (or `null` inside tool/RemoteAgent scopes).
export const ACTIVE_AGENT_CONTEXT_KEY = createContextKey(
  'OpenTelemetry BeeAI Active Agent Run'
);

export const activeRuns = new Map<string, ActiveRun>();

/**
 * Returns whether a value stored under `ACTIVE_AGENT_CONTEXT_KEY` is still an
 * active in-flight {@link ActiveAgentRun} tracked in `activeRuns`.
 *
 * @param value - Unknown context value read from `ACTIVE_AGENT_CONTEXT_KEY`
 *   (may be an {@link ActiveAgentRun}, `null` for an isolated tool/remote-agent
 *   scope, or `undefined`).
 */
export function isActiveAgentRun(value: unknown): value is ActiveAgentRun {
  if (!isRecord(value) || value.kind !== 'agent') {
    return false;
  }
  const candidate = value as unknown as ActiveAgentRun;
  return (
    typeof candidate.runId === 'string' &&
    activeRuns.get(candidate.runId) === candidate
  );
}

/**
 * Returns whether `span` is usable as a live OpenTelemetry parent: either a
 * local recording span (not yet ended) or a valid propagated remote span
 * context (whose `isRecording()` is always `false`).
 *
 * @param span - OpenTelemetry {@link Span} extracted from a context, or
 *   `undefined` when no span is bound to that context.
 */
export function isUsableCallerSpan(span: Span | undefined): span is Span {
  if (!span) {
    return false;
  }
  if (span.isRecording()) {
    return true;
  }
  const spanContext = span.spanContext();
  return spanContext.isRemote === true && isSpanContextValid(spanContext);
}

/**
 * Determines whether the creation-time `callerContext` is still valid to
 * inherit for the current execution of a lazy BeeAI `Run`. Returns
 * `callerContext` only on the initial execution while its span (if any) is
 * still live and compatible with `executionContext`; otherwise falls back to
 * `executionContext` once already consumed (re-execution), after its captured
 * local span ends, or when running under an active span from a different trace
 * (or after unspanned creation).
 *
 * @param callerContext - Single-use OpenTelemetry {@link Context} captured
 *   when the `Run` was constructed, or `undefined` if already consumed by an
 *   earlier execution.
 * @param executionContext - Live OpenTelemetry {@link Context} active at
 *   `await` / handler execution time (`context.active()`), checked to detect
 *   new active spans or cross-trace handoffs and returned as the fallback.
 * @returns `callerContext` if it should still be honored for suppression, agent
 *   attribution, and span parenting; otherwise `executionContext`.
 */
export function resolveActiveCallerContext(
  callerContext: Context | undefined,
  executionContext: Context
): Context {
  if (!callerContext) {
    return executionContext;
  }
  const rawCallerSpan = trace.getSpan(callerContext);
  const callerSpan = isUsableCallerSpan(rawCallerSpan)
    ? rawCallerSpan
    : undefined;

  if (rawCallerSpan && !callerSpan) {
    return executionContext;
  }

  const executionSpan = trace.getSpan(executionContext);
  if (isUsableCallerSpan(executionSpan)) {
    if (!callerSpan) {
      return executionContext;
    }
    if (
      executionSpan.spanContext().traceId !== callerSpan.spanContext().traceId
    ) {
      return executionContext;
    }
  }

  return callerContext;
}

/**
 * Walks the `Run` parent chain and OpenTelemetry contexts to find the enclosing
 * active agent run, stopping at tool or remote-agent boundaries so internal
 * helper calls inside tools are not attributed to the parent agent.
 *
 * @param parentId - BeeAI `runContext.parentId` linking this `Run` to its
 *   parent run in `activeRuns`, or `undefined` for top-level runs.
 * @param callerContext - Validated creation-time OpenTelemetry {@link Context}
 *   (from {@link resolveActiveCallerContext}), consulted as a fallback when
 *   `parentId` does not resolve to an active agent or tool boundary.
 * @param executionContext - Live OpenTelemetry {@link Context} active during
 *   handler execution, used to enforce tool/remote-agent isolation (`null`
 *   sentinel), detect cross-agent or cross-trace execution, and locate an
 *   enclosing agent when `RunContext` parentage is absent.
 * @returns The nearest live {@link ActiveAgentRun} that owns this execution,
 *   or `undefined` when executing standalone, inside a tool/remote-agent
 *   boundary, or across a different trace from the creating agent.
 */
export function findEnclosingAgentRun(
  parentId: string | undefined,
  callerContext?: Context,
  executionContext?: Context
): ActiveAgentRun | undefined {
  let currentId = parentId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const record = activeRuns.get(currentId);
    if (!record) break;
    // Tool boundary: internal model or sub-tool calls belong to the tool, not the outer agent.
    if (record.kind === 'tool') {
      return undefined;
    }
    if (record.kind === 'agent') {
      // A cold Run constructed under an agent (`parentId` = agent) may be awaited
      // inside a tool scope (`null`), inside another agent, or in a different trace.
      const execValue = executionContext?.getValue(ACTIVE_AGENT_CONTEXT_KEY);
      if (execValue === null) {
        return undefined;
      }
      if (isActiveAgentRun(execValue) && execValue !== record) {
        return execValue;
      }
      const recordSpan = trace.getSpan(record.invocation.getContext());
      const execSpan = executionContext
        ? trace.getSpan(executionContext)
        : undefined;
      if (
        recordSpan &&
        isUsableCallerSpan(execSpan) &&
        execSpan.spanContext().traceId !== recordSpan.spanContext().traceId
      ) {
        return undefined;
      }
      return record as ActiveAgentRun;
    }
    currentId = record.parentId;
  }
  // Executing inside a tool/remote-agent scope (e.g., passthrough `LangChainTool` or lost `RunContext`).
  if (executionContext?.getValue(ACTIVE_AGENT_CONTEXT_KEY) === null) {
    return undefined;
  }
  const fromCaller = callerContext?.getValue(ACTIVE_AGENT_CONTEXT_KEY);
  // Constructed inside a tool/remote-agent scope; do not fall through to an outer `executionContext` agent.
  if (fromCaller === null) {
    return undefined;
  }
  if (isActiveAgentRun(fromCaller)) {
    return fromCaller;
  }
  const fromExecution = executionContext?.getValue(ACTIVE_AGENT_CONTEXT_KEY);
  if (isActiveAgentRun(fromExecution)) {
    return fromExecution;
  }
  return undefined;
}

/**
 * Resolves the parent OpenTelemetry `Context` for a `Run`, preferring external
 * caller or execution spans over ancestor `Run` spans when nested.
 */
export function resolveParentContext(
  callerContext: Context,
  executionContext: Context,
  parentRun: ActiveRun | undefined
): Context {
  const rawCallerSpan = trace.getSpan(callerContext);
  const callerSpan = isUsableCallerSpan(rawCallerSpan)
    ? rawCallerSpan
    : undefined;
  const executionSpan = trace.getSpan(executionContext);

  if (parentRun) {
    const ancestorSpans = new Set<Span>();
    let current: ActiveRun | undefined = parentRun;
    const visited = new Set<string>();
    while (current && !visited.has(current.runId)) {
      visited.add(current.runId);
      const runSpan = trace.getSpan(current.invocation.getContext());
      if (runSpan) ancestorSpans.add(runSpan);
      if (current.callerSpan) ancestorSpans.add(current.callerSpan);
      current = current.parentId ? activeRuns.get(current.parentId) : undefined;
    }

    if (callerSpan && !ancestorSpans.has(callerSpan)) {
      return callerContext;
    }
    if (executionSpan && !ancestorSpans.has(executionSpan)) {
      return executionContext;
    }
    return parentRun.invocation.getContext();
  }

  if (callerSpan) {
    return callerContext;
  }
  return executionContext;
}
