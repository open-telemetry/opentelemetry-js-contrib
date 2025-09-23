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

/**
 * CPU usage data
 */
export interface CpuUsageData {
  cpuNumber: string;
  system: number;
  user: number;
  idle: number;
  nice: number;
  interrupt: number;
  systemP: number;
  userP: number;
  idleP: number;
  interruptP: number;
  niceP: number;
}

/**
 * Process CPU usage data
 */
export interface ProcessCpuUsageData {
  system: number;
  user: number;
  systemP: number;
  userP: number;
}

/**
 * Memory data
 */
export interface MemoryData {
  used: number;
  free: number;
  // cached: number;
  usedP: number;
  freeP: number;
  // cachedP: number;
}
