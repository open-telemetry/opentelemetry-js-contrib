/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PregelOptions } from '@langchain/langgraph/pregel';
import { isRecord } from './content';

export function createGraphStreamAccumulator(
  options: unknown,
  defaultModes: unknown
) {
  const config = (isRecord(options) ? options : {}) as Partial<
    PregelOptions<Record<string, never>, Record<string, never>>
  >;
  const modes = config.streamMode ?? defaultModes;
  const multiple = Array.isArray(config.streamMode);
  const mode =
    typeof modes === 'string'
      ? modes
      : Array.isArray(modes) && modes.length === 1
        ? modes[0]
        : undefined;
  const checkpointNamespace = config.configurable?.checkpoint_ns;
  let namespace =
    typeof checkpointNamespace === 'string'
      ? checkpointNamespace.split('|').filter(Boolean)
      : undefined;
  let output: unknown;
  return {
    add(chunk: unknown) {
      if (config.encoding === 'text/event-stream') return;
      let payload = chunk;
      let chunkMode = mode;
      if (config.subgraphs) {
        if (
          !Array.isArray(payload) ||
          !Array.isArray(payload[0]) ||
          !payload[0].every(item => typeof item === 'string')
        )
          return;
        const chunkNamespace: string[] = payload[0].filter(Boolean);
        // The SDK can inherit or reset the supplied namespace. A later
        // ancestor replaces tentative descendant output, even for updates.
        if (
          namespace === undefined ||
          chunkNamespace.length < namespace.length
        ) {
          namespace = chunkNamespace;
          output = undefined;
        }
        if (
          chunkNamespace.length !== namespace.length ||
          namespace.some((item, index) => item !== chunkNamespace[index])
        )
          return;
        payload = multiple ? payload.slice(1, 3) : payload[1];
      }
      if (multiple) {
        if (!Array.isArray(payload) || payload.length !== 2) return;
        [chunkMode, payload] = payload;
      }
      // Only values are complete state snapshots. Applying updates ourselves
      // would re-execute application reducers and change their semantics.
      if (chunkMode === 'values') output = payload;
    },
    output() {
      return output;
    },
  };
}
