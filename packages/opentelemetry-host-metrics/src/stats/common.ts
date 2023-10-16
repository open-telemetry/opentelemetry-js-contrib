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

import { CpuUsageData, MemoryData, ProcessCpuUsageData } from '../types';

const MILLISECOND = 1 / 1e3;
const MICROSECOND = 1 / 1e6;

let prevOsData: { time: number; cpus: os.CpuInfo[] };

/**
 * For each CPU returned by `os.cpus()` it returns
 * - the CPU times in each state (user, sys, ...) in seconds
 * - the % of time the CPU was in each state since last measurement
 *
 * The first time will return 0 for % masurements since there is not enough
 * data to calculate it
 */
export function getCpuUsageData(): CpuUsageData[] {
  if (typeof prevOsData !== 'object') {
    const time = Date.now();
    const cpus = os.cpus();
    prevOsData = { time, cpus };

    return cpus.map((cpu, cpuNumber) => ({
      cpuNumber: String(cpuNumber),
      idle: cpu.times.idle * MILLISECOND,
      user: cpu.times.user * MILLISECOND,
      system: cpu.times.sys * MILLISECOND,
      interrupt: cpu.times.irq * MILLISECOND,
      nice: cpu.times.nice * MILLISECOND,
      userP: 0,
      systemP: 0,
      idleP: 0,
      interruptP: 0,
      niceP: 0,
    }));
  }

  const currentTime = Date.now();
  const timeElapsed = currentTime - prevOsData.time;
  const currentCpus = { time: currentTime, cpus: os.cpus() };

  const usageData = currentCpus.cpus.map((cpu, cpuNumber) => {
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

  prevOsData = currentCpus;

  return usageData;
}

let prevProcessData: { time: number; usage: NodeJS.CpuUsage };

/**
 * It will return process usage information
 * - the CPU times in each state (user, system) in seconds
 * - the % of time the CPU was in each state since last measurement
 *
 * The first time will return 0 as value for % since it needs previous
 * measurement to do the calculation.
 */
export function getProcessCpuUsageData(): ProcessCpuUsageData {
  if (typeof prevProcessData !== 'object') {
    const usage = process.cpuUsage();
    const time = Date.now();

    prevProcessData = { time, usage };

    return {
      user: usage.user * MICROSECOND,
      system: usage.system * MICROSECOND,
      userP: 0,
      systemP: 0,
    };
  }

  const currUsage = process.cpuUsage();
  const prevUsage = prevProcessData.usage;

  const currentTime = Date.now(); // ms
  const timeElapsed = currentTime - prevProcessData.time; // ms
  const timeElapsedUs = timeElapsed;

  const user = currUsage.user * MICROSECOND;
  const system = currUsage.system * MICROSECOND;

  // Note: Date times are in miliseconds and `cpuUsage()` returns
  // microseconds. We nedd to have same unit for calculation
  const userP = (currUsage.user - prevUsage.user) /* us */ / timeElapsedUs;
  const systemP = (currUsage.system - prevUsage.system) / timeElapsedUs;

  prevProcessData = { time: currentTime, usage: currUsage };

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
