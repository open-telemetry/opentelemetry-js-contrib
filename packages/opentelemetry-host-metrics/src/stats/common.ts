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

const MILLISECOND = 1 / 1e3;
let cpuUsageTime: number | undefined = undefined;

/**
 * It returns cpu load delta from last time - to be used with SumObservers.
 * When called first time it will return 0 and then delta will be calculated
 */
export function getCpuUsageData(): CpuUsageData[] {
  if (typeof cpuUsageTime !== 'number') {
    cpuUsageTime = new Date().getTime() - process.uptime() * 1000;
  }

  const timeElapsed = (new Date().getTime() - cpuUsageTime) / 1000;

  return os.cpus().map((cpu, cpuNumber) => {
    const idle = cpu.times.idle * MILLISECOND;
    const user = cpu.times.user * MILLISECOND;
    const system = cpu.times.sys * MILLISECOND;
    const interrupt = cpu.times.irq * MILLISECOND;
    const nice = cpu.times.nice * MILLISECOND;

    const idleP = idle / timeElapsed;
    const userP = user / timeElapsed;
    const systemP = system / timeElapsed;
    const interruptP = interrupt / timeElapsed;
    const niceP = nice / timeElapsed;

    return {
      cpuNumber: String(cpuNumber),
      idle,
      user,
      system,
      interrupt,
      nice,
      userP,
      systemP,
      idleP,
      interruptP,
      niceP,
    };
  });
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
