/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isRecord } from './content';

export interface AgentStreamAccumulator {
  add(chunk: unknown): void;
  output(): unknown;
}

interface MessageEntry {
  message: Record<string, unknown>;
  id?: string;
}

function messageRole(message: unknown): unknown {
  if (Array.isArray(message)) return message[0];
  if (!isRecord(message)) return undefined;
  return typeof message._getType === 'function'
    ? message._getType()
    : (message.role ?? message.type);
}

function isOutputMessage(message: unknown): boolean {
  const role = messageRole(message);
  return (
    typeof role === 'string' &&
    !['human', 'user', 'system', 'developer'].includes(role)
  );
}

/**
 * Observe public agent.stream() chunks, passing its config as options.
 * Output is the final response only, like agentOutput() for invoke().
 * State snapshots supersede token deltas when multiple modes are requested.
 */
export function createAgentStreamAccumulator(
  options?: unknown
): AgentStreamAccumulator {
  const configuredMode =
    isRecord(options) && typeof options.streamMode === 'string'
      ? options.streamMode
      : undefined;
  const byId = new Map<string, MessageEntry>();
  const active = new Map<string, MessageEntry>();
  let latest: MessageEntry | undefined;
  let snapshot: unknown[] | undefined;
  let rootSnapshot: unknown[] | undefined;

  function addSnapshot(
    value: unknown,
    namespace: string[],
    complete = false
  ): void {
    if (
      !isRecord(value) ||
      !Array.isArray(value.messages) ||
      (!complete && value.messages.length === 0)
    )
      return;
    const message = value.messages[value.messages.length - 1];
    if (!complete && !isOutputMessage(message)) return;
    // An empty complete snapshot must also supersede earlier token deltas.
    snapshot = isOutputMessage(message) ? [message] : [];
    if (namespace.length === 0) rootSnapshot = snapshot;
  }

  function addMessage(value: unknown, namespace: string[]): void {
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      !isRecord(value[0]) ||
      !isOutputMessage(value[0])
    )
      return;
    const [message] = value;
    const metadata = isRecord(value[1]) ? value[1] : {};
    const scope = JSON.stringify([
      namespace,
      metadata.langgraph_checkpoint_ns,
      metadata.langgraph_node,
      metadata.langgraph_step,
      metadata.run_id,
      messageRole(message),
    ]);
    const id = typeof message.id === 'string' ? message.id : undefined;
    const idKey = JSON.stringify([namespace, id]);
    const previous = active.get(scope);
    let entry = id === undefined ? previous : byId.get(idKey);
    // Some providers supply the message ID only on the first or last delta.
    if (!entry && id !== undefined && previous?.id === undefined) {
      entry = previous;
    }
    if (entry) {
      if (
        typeof entry.message.concat === 'function' &&
        typeof message.concat === 'function'
      ) {
        const combined: unknown = entry.message.concat(message);
        if (!isRecord(combined)) {
          throw new TypeError(
            'LangChain message concat did not return a message'
          );
        }
        entry.message = combined;
      } else {
        // Full messages are snapshots, not deltas to concatenate again.
        entry.message = message;
      }
      entry.id ??= id;
    } else {
      entry = { message, id };
    }
    if (id !== undefined) byId.set(idKey, entry);
    active.set(scope, entry);
    latest = entry;
  }

  return {
    add(chunk: unknown): void {
      let mode = configuredMode;
      let payload = chunk;
      let namespace: string[] = [];
      if (
        Array.isArray(payload) &&
        (payload.length === 2 || payload.length === 3) &&
        Array.isArray(payload[0]) &&
        payload[0].every(item => typeof item === 'string')
      ) {
        namespace = payload[0];
        if (payload.length === 3 && typeof payload[1] === 'string') {
          mode = payload[1];
          payload = payload[2];
        } else {
          payload = payload[1];
        }
      }
      if (
        Array.isArray(payload) &&
        payload.length === 2 &&
        typeof payload[0] === 'string'
      ) {
        [mode, payload] = payload;
      }
      mode ??=
        Array.isArray(payload) && isRecord(payload[0])
          ? 'messages'
          : isRecord(payload) && Array.isArray(payload.messages)
            ? 'values'
            : 'updates';
      if (mode === 'messages') {
        addMessage(payload, namespace);
      } else if (mode === 'values') {
        addSnapshot(payload, namespace, true);
      } else if (mode === 'updates' && isRecord(payload)) {
        for (const update of Object.values(payload)) {
          addSnapshot(update, namespace);
        }
      }
    },
    output(): unknown {
      const result =
        rootSnapshot ?? snapshot ?? (latest ? [latest.message] : undefined);
      return result?.length ? result : undefined;
    },
  };
}
