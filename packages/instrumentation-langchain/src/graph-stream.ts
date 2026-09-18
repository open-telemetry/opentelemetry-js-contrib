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
  let output: unknown;
  return {
    add(chunk: unknown) {
      if (config.encoding === 'text/event-stream') return;
      let payload = chunk;
      let chunkMode = mode;
      if (config.subgraphs) {
        if (!Array.isArray(payload) || !Array.isArray(payload[0])) return;
        if (payload[0].length !== 0) return;
        payload = multiple ? payload.slice(1) : payload[1];
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
