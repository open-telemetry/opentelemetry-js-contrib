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

import { BaseMetrics } from './BaseMetrics';
import * as enums from './enum';

import { getCpuUsageData, getMemoryData } from './stats/common';
import { getNetworkData } from './stats/si';

import * as types from './types';

/**
 * Metrics Collector - collects metrics for CPU, Memory, Heap, Network, Event
 * Loop, Garbage Collector, Heap Space
 * the default label name for metric name is "name"
 */
export class HostMetrics extends BaseMetrics {
  private _memValueObserver: types.ValueObserverWithObservations | undefined;

  // MEMORY
  private _createMemValueObserver() {
    this._memValueObserver = this._createValueObserver(
      enums.METRIC_NAMES.MEMORY,
      Object.values(enums.MEMORY_LABELS),
      'Memory'
    );
  }

  /**
   * Creates metrics
   */
  protected _createMetrics(): void {
    // CPU COUNTER
    this._createCounter(
      enums.METRIC_NAMES.CPU,
      Object.values(enums.CPU_LABELS),
      'CPU Usage'
    );

    // NETWORK COUNTER
    this._createCounter(
      enums.METRIC_NAMES.NETWORK,
      Object.values(enums.NETWORK_LABELS),
      'Network Usage'
    );

    // MEMORY
    this._createMemValueObserver();

    this._meter.createBatchObserver(
      'metric_batch_observer',
      observerBatchResult => {
        Promise.all([
          getMemoryData(),
          getCpuUsageData(),
          getNetworkData(),
        ]).then(([memoryData, cpuUsage, networkData]) => {
          // CPU COUNTER
          Object.values(enums.CPU_LABELS).forEach(value => {
            this._counterUpdate(enums.METRIC_NAMES.CPU, value, cpuUsage[value]);
          });

          // NETWORK COUNTER
          Object.values(enums.NETWORK_LABELS).forEach(value => {
            this._counterUpdate(
              enums.METRIC_NAMES.NETWORK,
              value,
              networkData[value]
            );
          });

          // MEMORY
          this._updateObserver<types.MemoryData>(
            observerBatchResult,
            memoryData,
            this._memValueObserver
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
    Promise.all([getMemoryData(), getCpuUsageData(), getNetworkData()]).then(
      () => {
        this._createMetrics();
      }
    );
  }
}
