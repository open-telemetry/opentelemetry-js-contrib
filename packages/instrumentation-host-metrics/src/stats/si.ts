/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Import from the network file directly as bundlers trigger the 'osx-temperature-sensor' import in the systeminformation/lib/cpu.js,
// resulting in the following warning: "Can't resolve 'osx-temperature-sensor'"
// See https://github.com/open-telemetry/opentelemetry-js-contrib/pull/2071
import { networkStats } from 'systeminformation/lib/network';
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
