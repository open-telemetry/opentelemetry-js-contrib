/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as SI from 'systeminformation';
import { NetworkData } from '../types';
import { ObjectKeys } from '../util';

let previousNetworkStats: Partial<NetworkData> = {};

/**
 * It returns network usage delta from last time
 */
export function getNetworkData() {
  return new Promise<NetworkData>(resolve => {
    const stats: NetworkData = {
      bytesRecv: 0,
      bytesSent: 0,
    };
    SI.networkStats()
      .then(results => {
        results.forEach(result => {
          stats.bytesRecv += result.rx_bytes;
          stats.bytesSent += result.tx_bytes;
        });
        const lastStats = Object.assign({}, stats);

        ObjectKeys(stats).forEach(key => {
          stats[key] = stats[key] - (previousNetworkStats[key] || 0);
        });

        previousNetworkStats = lastStats;
        resolve(stats);
      })
      .catch(() => {
        resolve(stats);
      });
  });
}
