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

const previousNetworkStats: Record<string, Partial<NetworkData>> = {};

/**
 * It returns network usage as delta to be able to use with SumObservers.
 * With network usage we start counting from 0.
 */
export function getNetworkData() {
  return new Promise<NetworkData[]>(resolve => {
    const stats: Partial<NetworkData> = {
      rx_bytes: 0,
      rx_dropped: 0,
      rx_errors: 0,
      tx_bytes: 0,
      tx_dropped: 0,
      tx_errors: 0,
    };
    SI.networkStats()
      .then(results => {
        const allStats: NetworkData[] = [];
        for (let i = 0, j = results.length; i < j; i++) {
          const currentStats = Object.assign({}, stats);
          let previousStats = previousNetworkStats[results[i].iface];
          const firstTime = !previousStats;
          if (firstTime) {
            previousStats = {};
          }

          ObjectKeys(stats).forEach(key => {
            if (typeof stats[key] === 'number') {
              const current = results[i][key] as number;
              if (firstTime) {
                (previousStats[key] as number) = current;
                (currentStats[key] as number) = 0;
              } else {
                const previous = (previousStats[key] || 0) as number;
                (currentStats[key] as number) = current - previous;
                (previousStats[key] as number) = current;
              }
            }
          });
          currentStats.iface = results[i].iface;
          previousNetworkStats[currentStats.iface] = previousStats;
          allStats.push(currentStats as NetworkData);
        }

        resolve(allStats);
      })
      .catch(() => {
        resolve([]);
      });
  });
}
