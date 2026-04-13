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

import { diag } from '@opentelemetry/api';
import { heap, time } from '@datadog/pprof';
import type { Profile } from 'pprof-format';

import { buildDatakitCompatibleNodeProfiles } from './pprof';
import { buildProfilerTags } from './resource';
import type {
  CollectedProfile,
  NodeProfileType,
  NodeProfilingOptions,
  ProfileBatch,
  ProfileExporter,
} from './types';

const DEFAULT_INTERVAL_MILLIS = 60_000;
const DEFAULT_WALL_DURATION_MILLIS = 10_000;
const DEFAULT_HEAP_SAMPLING_INTERVAL_BYTES = 512 * 1024;
const DEFAULT_PROFILE_TYPES: NodeProfileType[] = ['wall', 'heap'];
const STACK_DEPTH = 64;

export class NodeProfiling {
  private readonly exporter: ProfileExporter;
  private readonly tags: Record<string, string>;
  private readonly profileTypes: NodeProfileType[];
  private readonly intervalMillis: number;
  private readonly wallDurationMillis: number;
  private readonly heapSamplingIntervalBytes: number;
  private readonly collectCpuTime: boolean;

  private timer?: NodeJS.Timeout;
  private collecting?: Promise<void>;
  private heapStarted = false;

  constructor(options: NodeProfilingOptions) {
    this.exporter = options.exporter;
    this.tags = buildProfilerTags(options);
    this.profileTypes = options.profileTypes ?? DEFAULT_PROFILE_TYPES;
    this.intervalMillis = options.intervalMillis ?? DEFAULT_INTERVAL_MILLIS;
    this.wallDurationMillis =
      options.wallDurationMillis ?? DEFAULT_WALL_DURATION_MILLIS;
    this.heapSamplingIntervalBytes =
      options.heapSamplingIntervalBytes ?? DEFAULT_HEAP_SAMPLING_INTERVAL_BYTES;
    this.collectCpuTime =
      options.cpuProfilingEnabled ?? options.collectCpuTime ?? true;
  }

  async start(): Promise<void> {
    if (this.timer !== undefined) {
      return;
    }

    this.ensureHeapProfiler();
    this.timer = setInterval(() => {
      if (this.collecting === undefined) {
        this.collecting = this.collectOnce()
          .catch(error => {
            diag.error('Node profiling collection failed', error);
          })
          .finally(() => {
            this.collecting = undefined;
          });
      }
    }, this.intervalMillis);
    this.timer.unref?.();
  }

  async collectOnce(): Promise<void> {
    this.ensureHeapProfiler();

    const startTime = new Date();
    const rawProfiles: Array<{ type: NodeProfileType; profile: Profile }> = [];

    if (this.profileTypes.includes('wall')) {
      const wallProfile = await time.profile({
        durationMillis: Math.min(this.wallDurationMillis, this.intervalMillis),
        collectCpuTime: this.collectCpuTime,
        useCPED: this.collectCpuTime,
        withContexts: this.collectCpuTime,
      });
      rawProfiles.push({ type: 'wall', profile: wallProfile });
    }

    if (this.profileTypes.includes('heap')) {
      rawProfiles.push({ type: 'heap', profile: heap.profile() });
    }

    const endTime = new Date();
    if (rawProfiles.length === 0) {
      diag.debug('No profile types were enabled, skipping export');
      return;
    }

    const profiles: CollectedProfile[] =
      buildDatakitCompatibleNodeProfiles(rawProfiles);

    const batch: ProfileBatch = {
      startTime,
      endTime,
      family: 'nodejs',
      format: 'pprof',
      tags: this.tags,
      profiles,
    };

    await this.exporter.export(batch);
  }

  async shutdown(): Promise<void> {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await this.collecting;

    if (this.heapStarted) {
      heap.stop();
      this.heapStarted = false;
    }

    await this.exporter.shutdown?.();
  }

  private ensureHeapProfiler(): void {
    if (!this.profileTypes.includes('heap') || this.heapStarted) {
      return;
    }

    heap.start(this.heapSamplingIntervalBytes, STACK_DEPTH);
    this.heapStarted = true;
  }
}
