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

import * as api from '@opentelemetry/api';
import {
  HostMetrics,
  ValueObserverWithObservations,
} from '@opentelemetry/host-metrics';
import * as enums from './enum';

import { getHeapData, getMemoryData, getProcessData } from './stats/common';
import { getStats } from './stats/native';

import * as types from './types';

/**
 * Metrics Collector - collects metrics for CPU, Memory, Heap, Network, Event
 * Loop, Garbage Collector, Heap Space
 * the default label name for metric name is "name"
 */
export class RuntimeMetrics extends HostMetrics {
  private _memRuntimeValueObserver: ValueObserverWithObservations | undefined;
  private _heapValueObserver: ValueObserverWithObservations | undefined;
  private _procesUptimeValueObserver: ValueObserverWithObservations | undefined;
  private _eventLoopValueObserver: ValueObserverWithObservations | undefined;
  private _gcValueObserver: ValueObserverWithObservations | undefined;
  private _gcByTypeValueObserver: ValueObserverWithObservations | undefined;
  private _heapSpaceValueObserver: ValueObserverWithObservations | undefined;

  // MEMORY RUNTIME
  private _createMemRuntimeValueObserver() {
    this._memRuntimeValueObserver = this._createValueObserver(
      enums.METRIC_NAMES.MEMORY_RUNTIME,
      Object.values(enums.MEMORY_LABELS_RUNTIME),
      'Memory Runtime'
    );
  }

  // HEAP
  private _createHeapValueObserver() {
    this._heapValueObserver = this._createValueObserver(
      enums.METRIC_NAMES.HEAP,
      Object.values(enums.HEAP_LABELS),
      'Heap Data'
    );
  }

  // PROCESS
  private _createProcesUptimeValueObserver() {
    this._procesUptimeValueObserver = this._createValueObserver(
      enums.METRIC_NAMES.PROCESS,
      Object.values(enums.PROCESS_LABELS),
      'Process UpTime'
    );
  }

  // EVENT LOOP
  private _createEventLoopValueObserver() {
    this._eventLoopValueObserver = this._createValueObserver(
      enums.METRIC_NAMES.EVENT_LOOP_DELAY,
      Object.values(enums.NATIVE_STATS_ITEM),
      'Event Loop'
    );
  }

  // GC ALL
  private _createGCValueObserver() {
    this._gcValueObserver = this._createValueObserver(
      enums.METRIC_NAMES.GC,
      Object.values(enums.NATIVE_STATS_ITEM),
      'GC for all'
    );
  }

  // GC BY TYPE
  private _createGCByTypeValueObserver() {
    this._gcByTypeValueObserver = this._createValueObserver(
      enums.METRIC_NAMES.GC_BY_TYPE,
      Object.values(enums.NATIVE_STATS_ITEM),
      'GC by type',
      'gc_type',
      [
        'scavenge',
        'markSweepCompact',
        'incrementalMarking',
        'processWeakCallbacks',
      ]
    );
  }

  // HEAP SPACE
  private _createHeapSpaceValueObserver() {
    const stats = getStats();
    const spacesLabels = stats?.heap.spaces.map(space => space.spaceName);
    this._heapSpaceValueObserver = this._createValueObserver(
      enums.METRIC_NAMES.HEAP_SPACE,
      Object.values(enums.NATIVE_SPACE_ITEM),
      'Heap Spaces',
      'heap_space',
      spacesLabels,
      this._boundKey('by', 'space')
    );
  }

  /**
   * Updates observer with heap spaces
   * @param observerBatchResult
   * @param stats
   * @param observerWithObservations
   */
  private _updateObserverSpaces(
    observerBatchResult: api.BatchObserverResult,
    stats: types.NativeStats | undefined,
    observerWithObservations?: ValueObserverWithObservations
  ) {
    if (observerWithObservations && stats) {
      observerWithObservations.observations.forEach(observation => {
        const stat = stats?.heap.spaces.find(space => {
          return space.spaceName === observation.labels['heap_space'];
        });
        let value;
        if (stat) {
          value =
            stat[observation.key as keyof types.NativeStatsSpaceItemNumbers];
        }
        if (typeof value === 'number') {
          observerBatchResult.observe(observation.labels, [
            observerWithObservations.observer.observation(value),
          ]);
        }
      });
    }
  }

  /**
   * Updates observer with gc types
   * @param observerBatchResult
   * @param stats
   * @param observerWithObservations
   */
  private _updateObserverGCByType(
    observerBatchResult: api.BatchObserverResult,
    stats: types.NativeStats | undefined,
    observerWithObservations?: ValueObserverWithObservations
  ) {
    if (observerWithObservations && stats) {
      observerWithObservations.observations.forEach(observation => {
        const type = observation.labelKey;
        if (!type) {
          return;
        }
        const stat = stats?.gc[observation.labels[type]];
        let value;
        if (stat) {
          value = stat[observation.key as keyof types.NativeStatsItem];
        }
        if (typeof value === 'number') {
          observerBatchResult.observe(observation.labels, [
            observerWithObservations.observer.observation(value),
          ]);
        }
      });
    }
  }

  /**
   * Creates metrics
   */
  protected _createMetrics() {
    // EVENT LOOP COUNTERS
    this._createCounter(
      enums.METRIC_NAMES.EVENT_LOOP_DELAY_COUNTER,
      Object.values(enums.NATIVE_STATS_ITEM_COUNTER),
      'Event Loop'
    );

    // MEMORY RUNTIME
    this._createMemRuntimeValueObserver();
    // HEAP
    this._createHeapValueObserver();
    // PROCESS
    this._createProcesUptimeValueObserver();
    // EVENT LOOP
    this._createEventLoopValueObserver();
    // GC ALL
    this._createGCValueObserver();
    // GC BY TYPE
    this._createGCByTypeValueObserver();
    // HEAP SPACE
    this._createHeapSpaceValueObserver();

    this._meter.createBatchObserver(
      'metric_batch_observer',
      observerBatchResult => {
        Promise.all([
          getMemoryData(),
          getHeapData(),
          getProcessData(),
          getStats(),
        ]).then(([memoryData, heapData, processData, stats]) => {
          // EVENT LOOP COUNTERS
          Object.values(enums.NATIVE_STATS_ITEM_COUNTER).forEach(value => {
            this._counterUpdate(
              enums.METRIC_NAMES.EVENT_LOOP_DELAY_COUNTER,
              value,
              stats?.eventLoop[value]
            );
          });

          // MEMORY RUNTIME
          this._updateObserver<types.MemoryData>(
            observerBatchResult,
            memoryData,
            this._memRuntimeValueObserver
          );

          // HEAP
          this._updateObserver<types.HeapData>(
            observerBatchResult,
            heapData,
            this._heapValueObserver
          );

          // PROCESS
          this._updateObserver<types.ProcessData>(
            observerBatchResult,
            processData,
            this._procesUptimeValueObserver
          );

          // EVENT LOOP
          this._updateObserver<types.NativeStatsItem | undefined>(
            observerBatchResult,
            stats?.eventLoop,
            this._eventLoopValueObserver
          );

          // GC ALL
          this._updateObserver<types.NativeStatsItem | undefined>(
            observerBatchResult,
            stats?.gc.all,
            this._gcValueObserver
          );

          // GC BY TYPE
          this._updateObserverGCByType(
            observerBatchResult,
            stats,
            this._gcByTypeValueObserver
          );

          // HEAP SPACE
          this._updateObserverSpaces(
            observerBatchResult,
            stats,
            this._heapSpaceValueObserver
          );
        });
      },
      {
        maxTimeoutUpdateMS: this._maxTimeoutUpdateMS,
        logger: this._logger,
      }
    );
  }

  /**
   * Starts collecting stats
   */
  start() {
    // initial collection
    Promise.all([
      getMemoryData(),
      getHeapData(),
      getProcessData(),
      getStats(),
    ]).then(() => {
      this._createMetrics();
    });
  }
}
