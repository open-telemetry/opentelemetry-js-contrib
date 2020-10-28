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
  CPU = 'cpu',
  NETWORK = 'net',
  MEMORY = 'mem',
}

export enum CPU_LABELS {
  USER = 'user',
  SYSTEM = 'sys',
  USAGE = 'usage',
  TOTAL = 'total',
}

export enum NETWORK_LABELS {
  BYTES_SENT = 'bytesSent',
  BYTES_RECEIVED = 'bytesRecv',
}

export enum MEMORY_LABELS {
  AVAILABLE = 'available',
  TOTAL = 'total',
}
