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

// Import from network file directly as importing from the root imports the /lib/cpu file,
// resulting in also having to add osx-temperature-sensor as a dependency for macOS,
// while /lib/cpu isn't even used by this package (deep-importing not working as expected)
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
