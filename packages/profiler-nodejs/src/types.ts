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

import type { Resource } from '@opentelemetry/resources';

export type NodeProfileType = 'wall' | 'heap';

export interface CollectedProfile {
  type: string;
  filename: string;
  data: Buffer;
}

export interface ProfileBatch {
  startTime: Date;
  endTime: Date;
  family: 'nodejs';
  format: 'pprof';
  tags: Record<string, string>;
  profiles: CollectedProfile[];
}

export interface ProfileExporter {
  export(batch: ProfileBatch): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface DatakitProfilingExporterOptions {
  endpoint?: string;
  timeoutMillis?: number;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export interface NodeProfilingOptions {
  exporter: ProfileExporter;
  resource?: Resource;
  tags?: Record<string, string | number | boolean>;
  serviceName?: string;
  serviceVersion?: string;
  deploymentEnvironment?: string;
  hostName?: string;
  profileTypes?: NodeProfileType[];
  intervalMillis?: number;
  wallDurationMillis?: number;
  heapSamplingIntervalBytes?: number;
  /**
   * Enables CPU time collection inside the wall profile.
   *
   * This follows the Node.js profiling model used by Datadog's profiler where
   * `cpu-time` is emitted as a sample type in the wall profile.
   */
  cpuProfilingEnabled?: boolean;
  /**
   * @deprecated Use `cpuProfilingEnabled` instead.
   */
  collectCpuTime?: boolean;
}
