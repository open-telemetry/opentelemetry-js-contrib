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
  EVENT_LOOP_DELAY = 'runtime.node.eventLoop.delay',
  EVENT_LOOP_DELAY_COUNTER = 'runtime.node.eventLoop.delayCounter',
  GC = 'runtime.node.gc.pause',
  GC_BY_TYPE = 'runtime.node.gc.pause.by.type',
  HEAP = 'runtime.node.heap',
  HEAP_SPACE = 'runtime.node.heapSpace',
  MEMORY_RUNTIME = 'runtime.node.mem',
  NATIVE = 'native',
  PROCESS = 'runtime.node.process',
}

export enum MEMORY_LABELS_RUNTIME {
  EXTERNAL = 'external',
  FREE = 'free',
  HEAP_TOTAL = 'heapTotal',
  HEAP_USED = 'heapUsed',
  RSS = 'rss',
}

export enum HEAP_LABELS {
  TOTAL_HEAP_SIZE = 'totalHeapSize',
  TOTAL_HEAP_SIZE_EXECUTABLE = 'totalHeapSizeExecutable',
  TOTAL_PHYSICAL_SIZE = 'totalPhysicalSize',
  TOTAL_AVAILABLE_SIZE = 'totalAvailableSize',
  USED_HEAP_SIZE = 'usedHeapSize',
  HEAP_SIZE_LIMIT = 'heapSizeLimit',
  MALLOCED_MEMORY = 'mallocedMemory',
  PEAK_MALLOCED_MEMORY = 'peakMallocedMemory',
  DOES_ZAP_GARBAGE = 'doesZapGarbage',
}

export enum PROCESS_LABELS {
  UP_TIME = 'upTime',
}

export enum NATIVE_STATS_ITEM {
  MIN = 'min',
  MAX = 'max',
  AVG = 'avg',
  MEDIAN = 'median',
  P95 = 'p95',
}

export enum NATIVE_STATS_ITEM_COUNTER {
  SUM = 'sum',
  TOTAL = 'total',
  COUNT = 'count',
}

export enum NATIVE_SPACE_ITEM {
  SPACE_SIZE = 'size',
  SPACE_USED_SIZE = 'usedSize',
  SPACE_AVAILABLE_SIZE = 'availableSize',
  PHYSICAL_SPACE_SIZE = 'physicalSize',
}
