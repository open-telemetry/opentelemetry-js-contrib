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
  graph: object;
  started: boolean;
  context?: Context;
}

const graphInvocations = new WeakMap<object, GraphInvocation>();

export function hasPendingGraphInvocation(
  callbacks: unknown,
  graph: object
): boolean {
  const handlers = Array.isArray(callbacks)
    ? callbacks
    : ownValue(callbacks, 'handlers');
  return (
    Array.isArray(handlers) &&
    handlers.some(handler => {
      const invocation = isRecord(handler)
        ? graphInvocations.get(handler)
        : undefined;
      return invocation?.graph === graph && !invocation.started;
    })
  );
}

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
  graph: object,
  start: (
    input: unknown,
    metadata: Record<string, unknown> | undefined,
    parent: Context | undefined
  ) => Context | undefined,
  end: (input: unknown, output: unknown, failure?: { error: unknown }) => void
): CallbackManager {
  const parent = getGraphContext(configured);
  const invocation: GraphInvocation = { graph, started: false };
  let input: unknown;
  let ended = false;
  const finish = (
    output: unknown,
    kwargs: unknown,
    failure?: { error: unknown }
  ) => {
    if (ended) return;
    ended = true;
    invocation.context = undefined;
    const finalInput = ownValue(kwargs, 'inputs');
    end(finalInput !== undefined ? finalInput : input, output, failure);
    input = undefined;
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
      invocation.started = true;
      input = inputs;
      const toolParent = parentRunId
        ? getToolContext({ runId: parentRunId, handlers: configured.handlers })
        : undefined;
      invocation.context = start(inputs, metadata, toolParent ?? parent);
    },
    handleChainEnd(output, _runId, _parentRunId, _tags, kwargs) {
      finish(output, kwargs);
    },
    handleChainError(error, _runId, _parentRunId, _tags, kwargs) {
      finish(undefined, kwargs, { error });
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
