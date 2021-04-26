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

export enum METRIC_NAMES {
  CPU_TIME = 'system.cpu.time',
  CPU_UTILIZATION = 'system.cpu.utilization',
  MEMORY_USAGE = 'system.memory.usage',
  MEMORY_UTILIZATION = 'system.memory.utilization',
  NETWORK_DROPPED = 'system.network.dropped',
  NETWORK_ERRORS = 'system.network.errors',
  NETWORK_IO = 'system.network.io',
}

export enum CPU_LABELS {
  USER = 'user',
  SYSTEM = 'system',
  IDLE = 'idle',
  INTERRUPT = 'interrupt',
  NICE = 'nice',
}

export enum NETWORK_LABELS {
  DEVICE = 'device',
  RECEIVE = 'receive',
  TRANSMIT = 'transmit',
}

export enum MEMORY_LABELS {
  FREE = 'free',
  USED = 'used',
}
