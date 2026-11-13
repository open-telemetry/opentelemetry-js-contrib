/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Context } from '@opentelemetry/api';
import type { CallbackManager } from '@langchain/core/callbacks/manager';
import type { CallbackHandlerMethods } from '@langchain/core/callbacks/base';
import { isRecord } from './content';
import { ownValue } from './internal-workflows';
import { getToolContext } from './tool-callbacks';

interface GraphInvocation {
  context?: Context;
}

const graphInvocations = new WeakMap<object, GraphInvocation>();

export function getGraphContext(callbacks: unknown): Context | undefined {
  const handlers = Array.isArray(callbacks)
    ? callbacks
    : ownValue(callbacks, 'handlers');
  let parent: Context | undefined;
  for (const handler of Array.isArray(handlers) ? handlers : []) {
    if (isRecord(handler))
      parent = graphInvocations.get(handler)?.context ?? parent;
  }
  return parent;
}

/**
 * Completion callbacks belong only to this graph invocation. Its inert parent
 * marker is inherited by nodes and subgraphs, independently of SDK run IDs.
 */
export function addGraphCallbacks(
  configured: CallbackManager,
  manager: typeof CallbackManager,
  start: (
    input: unknown,
    metadata: Record<string, unknown> | undefined,
    parent: Context | undefined
  ) => Context | undefined,
  end: (output: unknown, failure?: { error: unknown }) => void
): CallbackManager {
  const parent = getGraphContext(configured);
  for (const handler of configured.handlers) {
    if (graphInvocations.has(handler)) configured.removeHandler(handler);
  }
  const invocation: GraphInvocation = {};
  let ended = false;
  const finish = (output: unknown, failure?: { error: unknown }) => {
    if (ended) return;
    ended = true;
    invocation.context = undefined;
    end(output, failure);
  };
  const callbacks: CallbackHandlerMethods = {
    handleChainStart(
      _serialized,
      inputs,
      _runId,
      parentRunId,
      _tags,
      metadata
    ) {
      const toolParent = parentRunId
        ? getToolContext({ runId: parentRunId, handlers: configured.handlers })
        : undefined;
      invocation.context = start(inputs, metadata, toolParent ?? parent);
    },
    handleChainEnd(output) {
      finish(output);
    },
    handleChainError(error) {
      // LangGraph uses bubble-up errors for interrupts and parent commands.
      const failure =
        isRecord(error) && error.is_bubble_up === true ? undefined : { error };
      finish(undefined, failure);
    },
  };
  const handler = manager.fromHandlers(callbacks).handlers[0];
  handler.name = 'opentelemetry_langchain_graph';
  handler.awaitHandlers = true;
  configured.addHandler(handler, false);
  const marker = manager.fromHandlers({}).handlers[0];
  marker.name = 'opentelemetry_langchain_graph_parent';
  graphInvocations.set(marker, invocation);
  configured.addHandler(marker, true);
  return configured;
}
