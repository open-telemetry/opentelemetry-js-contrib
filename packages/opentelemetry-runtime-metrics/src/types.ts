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
import { DoesZapCodeSpaceFlag } from 'v8';

/**
 * Process data
 */
export interface ProcessData {
  upTime: number;
}

/**
 * Memory data
 */
export interface MemoryData {
  external: number;
  free: number;
  heapTotal: number;
  heapUsed: number;
  rss: number;
}

/**
 * Heap Data
 */
export interface HeapData {
  doesZapGarbage: DoesZapCodeSpaceFlag;
  heapSizeLimit: number;
  mallocedMemory: number;
  peakMallocedMemory: number;
  totalAvailableSize: number;
  totalHeapSize: number;
  totalHeapSizeExecutable: number;
  totalPhysicalSize: number;
  usedHeapSize: number;
}

/**
 * Native stats interface
 */
export interface NativeStatsObj {
  // returns native stats
  stats: () => NativeStats;
  // start collecting stats
  start: () => void;
  // stops collecting stats
  stop: () => void;
}

/**
 * Native stats (event loop, gc, heap spaces)
 */
export interface NativeStats {
  eventLoop: NativeStatsItem;
  gc: { [key: string]: NativeStatsItem };
  heap: {
    spaces: (NativeStatsSpaceItem & NativeStatsSpaceItemNumbers)[];
  };
}

/**
 * Native stats space item that with string values only
 */
export interface NativeStatsSpaceItem {
  spaceName: string;
}

/**
 * Native stats space item that with number values only
 */
export interface NativeStatsSpaceItemNumbers {
  availableSize: number;
  physicalSpaceSize: number;
  size: number;
  usedSize: number;
}

/**
 * Native stats item
 */
export interface NativeStatsItem {
  avg: number;
  count: number;
  max: number;
  median: number;
  min: number;
  p95: number;
  sum: number;
  total: number;
}
