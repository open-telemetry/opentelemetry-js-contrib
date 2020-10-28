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

import * as os from 'os';
import { CPU_LABELS, MEMORY_LABELS } from '../enum';

import { CpuUsageData, MemoryData } from '../types';

const MICROSECOND = 1 / 1e6;
let cpuUsage: NodeJS.CpuUsage | undefined;

/**
 * It returns cpu load delta from last time
 */
export function getCpuUsageData(): CpuUsageData {
  const elapsedUsage = process.cpuUsage(cpuUsage);
  cpuUsage = process.cpuUsage();
  return {
    [CPU_LABELS.USER]: elapsedUsage.user * MICROSECOND,
    [CPU_LABELS.SYSTEM]: elapsedUsage.system * MICROSECOND,
    [CPU_LABELS.USAGE]: (elapsedUsage.user + elapsedUsage.system) * MICROSECOND,
    [CPU_LABELS.TOTAL]: (cpuUsage.user + cpuUsage.system) * MICROSECOND,
  };
}

/**
 * Returns memory data stats
 */
export function getMemoryData(): MemoryData {
  return {
    [MEMORY_LABELS.AVAILABLE]: os.freemem(),
    [MEMORY_LABELS.TOTAL]: os.totalmem(),
  };
}
