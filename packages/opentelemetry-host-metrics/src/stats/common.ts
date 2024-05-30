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

import { cpus, totalmem, freemem } from 'node:os';
import type { CpuInfo } from 'node:os';
import type { CpuUsageData, MemoryData, ProcessCpuUsageData } from '../types';

const MILLISECOND = 1 / 1e3;
const MICROSECOND = 1 / 1e6;

/**
 * We get data as soon as we load the module so the 1st collect
 * of the metric already has valuable data to be sent.
 */
let prevOsData: { time: number; cpus: CpuInfo[] } = {
  time: Date.now(),
  cpus: cpus(),
};

/**
 * For each CPU returned by `os.cpus()` it returns
 * - the CPU times in each state (user, sys, ...) in seconds
 * - the % of time the CPU was in each state since last measurement
 */
export function getCpuUsageData(): CpuUsageData[] {
  const currentTime = Date.now();
  const timeElapsed = currentTime - prevOsData.time;
  const currentOsData = { time: currentTime, cpus: cpus() };

  const usageData = currentOsData.cpus.map((cpu, cpuNumber) => {
    const prevTimes = prevOsData.cpus[cpuNumber].times;
    const currTimes = cpu.times;

    const idle = currTimes.idle * MILLISECOND;
    const user = currTimes.user * MILLISECOND;
    const system = currTimes.sys * MILLISECOND;
    const interrupt = currTimes.irq * MILLISECOND;
    const nice = currTimes.nice * MILLISECOND;

    const idleP = (currTimes.idle - prevTimes.idle) / timeElapsed;
    const userP = (currTimes.user - prevTimes.user) / timeElapsed;
    const systemP = (currTimes.sys - prevTimes.sys) / timeElapsed;
    const interruptP = (currTimes.irq - prevTimes.irq) / timeElapsed;
    const niceP = (currTimes.nice - prevTimes.nice) / timeElapsed;

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

  prevOsData = currentOsData;

  return usageData;
}

/**
 * We get data as soon as we load the module so the 1st collect
 * of the metric already has valuable data to be sent.
 */
let prevProcData: { time: number; usage: NodeJS.CpuUsage } = {
  time: Date.now(),
  usage: process.cpuUsage(),
};

/**
 * Gets the process CPU usage and returns
 * - the time spent in `user` state
 * - the time spent in `system` state
 * - the % of time in `user` state since last measurement
 * - the % of time in `system` state since last measurement
 */
export function getProcessCpuUsageData(): ProcessCpuUsageData {
  const currentTime = Date.now();
  const currentUsage = process.cpuUsage();
  const prevUsage = prevProcData.usage;
  // According to semantic conventions we need to divide by
  // - time elapsed (in microseconds to match `process.cpuUsage()` units)
  // - number of CPUs
  const timeElapsed = (currentTime - prevProcData.time) * 1000;
  const cpusTimeElapsed = timeElapsed * prevOsData.cpus.length;

  const user = currentUsage.user * MICROSECOND;
  const system = currentUsage.system * MICROSECOND;
  const userP = (currentUsage.user - prevUsage.user) / cpusTimeElapsed;
  const systemP = (currentUsage.system - prevUsage.system) / cpusTimeElapsed;

  prevProcData = { time: currentTime, usage: currentUsage };

  return {
    user,
    system,
    userP,
    systemP,
  };
}

/**
 * Returns memory data as absolute values
 */
export function getMemoryData(): MemoryData {
  const total = totalmem();
  const free = freemem();

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

/**
 * Returns process memory RSS
 * The Resident Set Size, is the amount of space occupied in the main memory device (that is a subset of the total allocated memory) for the process,
 * including all C++ and JavaScript objects and code.
 */
export function getProcessMemoryData(): number {
  // `process.memoryUsage.rss` is a faster alternative introduced in v14.18.0.
  // Prefer it if available.
  if (process.memoryUsage.rss) {
    return process.memoryUsage.rss();
  }
  return process.memoryUsage().rss;
}
