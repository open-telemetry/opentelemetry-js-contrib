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

import { CpuUsageData, MemoryData } from '../types';

const MICROSECOND = 1 / 1e6;
let cpuUsageTime = 0;

/**
 * It returns cpu load delta from last time - to be used with SumObservers.
 * When called first time it will return 0 and then delta will be calculated
 */
export function getCpuUsageData(): CpuUsageData {
  if (!cpuUsageTime) {
    cpuUsageTime = new Date().getTime() - process.uptime() * 1000;
  }

  const timeElapsed = (new Date().getTime() - cpuUsageTime) / 1000;
  const elapsedUsage = process.cpuUsage();

  const user = elapsedUsage.user * MICROSECOND;
  const system = elapsedUsage.system * MICROSECOND;
  const idle = Math.max(0, timeElapsed - user - system);

  const userP = user / timeElapsed;
  const systemP = system / timeElapsed;
  const idleP = idle / timeElapsed;

  return {
    user: user,
    system: system,
    idle: idle,
    userP: userP,
    systemP: systemP,
    idleP: idleP,
  };
}

/**
 * Returns memory data as absolute values
 */
export function getMemoryData(): MemoryData {
  const total = os.totalmem();
  const free = os.freemem();

  const used = total - free;

  const freeP = free / total;
  const usedP = used / total;

  return {
    used: used,
    free: free,
    usedP: usedP, // this is frac part (0-1)
    freeP: freeP, // this is frac part (0-1)
  };
}
