/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Import from the network file directly as bundlers trigger the 'osx-temperature-sensor' import in the systeminformation/lib/cpu.js,
// resulting in the following warning: "Can't resolve 'osx-temperature-sensor'"
// See https://github.com/open-telemetry/opentelemetry-js-contrib/pull/2071
// The .js extension is required: the ESM build keeps this specifier and Node ESM does not add extensions to deep paths.
import { networkStats } from 'systeminformation/lib/network.js';
import type { Systeminformation } from 'systeminformation';

export function getNetworkData() {
  return new Promise<Systeminformation.NetworkStatsData[]>(resolve => {
    networkStats()
      .then(resolve)
      .catch(() => {
        resolve([]);
      });
  });
}
