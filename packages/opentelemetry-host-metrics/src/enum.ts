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
  PROCESS_CPU_TIME = 'process.cpu.time',
  PROCESS_CPU_UTILIZATION = 'process.cpu.utilization',
  PROCESS_MEMORY_USAGE = 'process.memory.usage',
}

export enum ATTRIBUTE_NAMES {
  SYSTEM_CPU_LOGICAL_NUMBER = 'system.cpu.logical_number',
  SYSTEM_CPU_STATE = 'system.cpu.state',
  SYSTEM_MEMORY_STATE = 'system.memory.state',
  SYSTEM_DEVICE = 'system.device',
  NETWORK_NETWORK_DIRECTION = 'network.io.direction',
  SYSTEM_NETWORK_STATE = 'system.network.state',
  PROCESS_CPU_STATE = 'process.cpu.state',
}

export enum CPU_LABELS {
  USER = 'user',
  SYSTEM = 'system',
  IDLE = 'idle',
  INTERRUPT = 'interrupt',
  NICE = 'nice',
}

export enum NETWORK_LABELS {
  RECEIVE = 'receive',
  TRANSMIT = 'transmit',
}

export enum MEMORY_LABELS {
  FREE = 'free',
  USED = 'used',
}
