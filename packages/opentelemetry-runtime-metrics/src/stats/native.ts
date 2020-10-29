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
// eslint-disable-next-line  @typescript-eslint/no-var-requires
const nodeGypBuild = require('node-gyp-build');
import * as path from 'path';
import { NativeStats, NativeStatsObj } from '../types';

const base = path.resolve(`${__dirname}/../../..`);
let nativeMetrics: NativeStatsObj;

/**
 * Returns native stats (event loop, gc, heap spaces)
 */
export function getStats(): NativeStats | undefined {
  if (!nativeMetrics) {
    try {
      nativeMetrics = nodeGypBuild(base);
      nativeMetrics.start();
    } catch (e) {
      console.log(e.message);
    }
  }
  const stats: NativeStats | undefined = nativeMetrics
    ? nativeMetrics.stats()
    : undefined;
  if (stats) {
    stats.eventLoop.total = stats.eventLoop.sum;
    Object.keys(stats.gc).forEach(key => {
      stats.gc[key].total = stats.gc[key].sum;
    });
  }
  return stats;
}
