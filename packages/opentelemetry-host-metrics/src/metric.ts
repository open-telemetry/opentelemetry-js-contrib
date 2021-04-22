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
import * as api from '@opentelemetry/api-metrics';
import * as enums from './enum';

import { getCpuUsageData, getMemoryData } from './stats/common';
import { getNetworkData } from './stats/si';
import { CpuUsageData, MemoryData, NetworkData } from './types';

/**
 * Metrics Collector - collects metrics for CPU, Memory, Network
 */
export class HostMetrics extends BaseMetrics {
  private _cpuTimeObserver!: api.SumObserver;
  private _cpuUtilizationObserver!: api.ValueObserver;
  private _memUsageObserver!: api.UpDownSumObserver;
  private _memUtilizationObserver!: api.ValueObserver;
  private _networkDroppedObserver!: api.SumObserver;
  private _networkErrorsObserver!: api.SumObserver;
  private _networkIOObserver!: api.SumObserver;

  private _updateCpuTime(
    observerBatchResult: api.BatchObserverResult,
    cpuUsages: CpuUsageData[]
  ): void {
    for (let i = 0, j = cpuUsages.length; i < j; i++) {
      const cpuUsage = cpuUsages[i];
      observerBatchResult.observe(
        {
          state: enums.CPU_LABELS.USER,
          cpu: cpuUsage.cpuNumber
        },
        [this._cpuTimeObserver?.observation(cpuUsage.user)]
      );
      observerBatchResult.observe(
        {
          state: enums.CPU_LABELS.SYSTEM,
          cpu: cpuUsage.cpuNumber
        },
        [this._cpuTimeObserver?.observation(cpuUsage.system)]
      );
      observerBatchResult.observe(
        {
          state: enums.CPU_LABELS.IDLE,
          cpu: cpuUsage.cpuNumber
        },
        [this._cpuTimeObserver?.observation(cpuUsage.idle)]
      );
      observerBatchResult.observe(
        {
          state: enums.CPU_LABELS.INTERRUPT,
          cpu: cpuUsage.cpuNumber
        },
        [this._cpuTimeObserver?.observation(cpuUsage.interrupt)]
      );
      observerBatchResult.observe(
        {
          state: enums.CPU_LABELS.NICE,
          cpu: cpuUsage.cpuNumber
        },
        [this._cpuTimeObserver?.observation(cpuUsage.nice)]
      );
    }

  }

  private _updateCpuUtilisation(
    observerBatchResult: api.BatchObserverResult,
    cpuUsages: CpuUsageData[]
  ): void {
    for (let i = 0, j = cpuUsages.length; i < j; i++) {
      const cpuUsage = cpuUsages[i];
      observerBatchResult.observe(
        {
          state: enums.CPU_LABELS.USER,
          cpu: cpuUsage.cpuNumber
        },
        [this._cpuUtilizationObserver?.observation(cpuUsage.userP)]
      );
      observerBatchResult.observe(
        {
          state: enums.CPU_LABELS.SYSTEM,
          cpu: cpuUsage.cpuNumber
        },
        [this._cpuUtilizationObserver?.observation(cpuUsage.systemP)]
      );
      observerBatchResult.observe(
        {
          state: enums.CPU_LABELS.IDLE,
          cpu: cpuUsage.cpuNumber
        },
        [this._cpuUtilizationObserver?.observation(cpuUsage.idleP)]
      );
      observerBatchResult.observe(
        {
          state: enums.CPU_LABELS.INTERRUPT,
          cpu: cpuUsage.cpuNumber
        },
        [this._cpuUtilizationObserver?.observation(cpuUsage.interruptP)]
      );
      observerBatchResult.observe(
        {
          state: enums.CPU_LABELS.NICE,
          cpu: cpuUsage.cpuNumber
        },
        [this._cpuUtilizationObserver?.observation(cpuUsage.niceP)]
      );
    }

  }

  private _updateMemUsage(
    observerBatchResult: api.BatchObserverResult,
    memUsage: MemoryData
  ): void {
    observerBatchResult.observe(
      {
        state: enums.MEMORY_LABELS.USED,
      },
      [this._memUsageObserver?.observation(memUsage.used)]
    );
    observerBatchResult.observe(
      {
        state: enums.MEMORY_LABELS.FREE,
      },
      [this._memUsageObserver?.observation(memUsage.free)]
    );
  }

  private _updateMemUtilization(
    observerBatchResult: api.BatchObserverResult,
    memUsage: MemoryData
  ): void {
    observerBatchResult.observe(
      {
        state: enums.MEMORY_LABELS.USED,
      },
      [this._memUtilizationObserver?.observation(memUsage.usedP)]
    );
    observerBatchResult.observe(
      {
        state: enums.MEMORY_LABELS.FREE,
      },
      [this._memUtilizationObserver?.observation(memUsage.freeP)]
    );
  }

  private _updateNetwork(
    observerBatchResult: api.BatchObserverResult,
    networkUsages: NetworkData[]
  ): void {
    for (let i = 0, j = networkUsages.length; i < j; i++) {
      const networkUsage = networkUsages[i];
      observerBatchResult.observe(
        {
          [enums.NETWORK_LABELS.DEVICE]: networkUsage.iface,
          direction: enums.NETWORK_LABELS.RECEIVE,
        },
        [this._networkDroppedObserver?.observation(networkUsage.rx_dropped)]
      );
      observerBatchResult.observe(
        {
          device: networkUsage.iface,
          direction: enums.NETWORK_LABELS.TRANSMIT,
        },
        [this._networkDroppedObserver?.observation(networkUsage.tx_dropped)]
      );

      observerBatchResult.observe(
        {
          device: networkUsage.iface,
          direction: enums.NETWORK_LABELS.RECEIVE,
        },
        [this._networkErrorsObserver?.observation(networkUsage.rx_errors)]
      );
      observerBatchResult.observe(
        {
          device: networkUsage.iface,
          direction: enums.NETWORK_LABELS.TRANSMIT,
        },
        [this._networkErrorsObserver?.observation(networkUsage.tx_errors)]
      );

      observerBatchResult.observe(
        {
          device: networkUsage.iface,
          direction: enums.NETWORK_LABELS.RECEIVE,
        },
        [this._networkIOObserver?.observation(networkUsage.rx_bytes)]
      );
      observerBatchResult.observe(
        {
          device: networkUsage.iface,
          direction: enums.NETWORK_LABELS.TRANSMIT,
        },
        [this._networkIOObserver?.observation(networkUsage.tx_bytes)]
      );
    }
  }

  /**
   * Creates metrics
   */
  protected _createMetrics(): void {
    // CPU
    this._cpuTimeObserver = this._meter.createSumObserver(
      enums.METRIC_NAMES.CPU_TIME,
      { description: 'Cpu time in seconds', unit: 's' }
    );
    this._cpuUtilizationObserver = this._meter.createValueObserver(
      enums.METRIC_NAMES.CPU_UTILIZATION,
      {
        description: 'Cpu usage time 0-1',
      }
    );
    this._memUsageObserver = this._meter.createUpDownSumObserver(
      enums.METRIC_NAMES.MEMORY_USAGE,
      {
        description: 'Memory usage in bytes',
      }
    );
    this._memUtilizationObserver = this._meter.createValueObserver(
      enums.METRIC_NAMES.MEMORY_UTILIZATION,
      {
        description: 'Memory usage 0-1',
      }
    );
    this._networkDroppedObserver = this._meter.createSumObserver(
      enums.METRIC_NAMES.NETWORK_DROPPED,
      {
        description: 'Network dropped packets',
      }
    );
    this._networkErrorsObserver = this._meter.createSumObserver(
      enums.METRIC_NAMES.NETWORK_ERRORS,
      {
        description: 'Network errors counter',
      }
    );
    this._networkIOObserver = this._meter.createSumObserver(
      enums.METRIC_NAMES.NETWORK_IO,
      {
        description: 'Network transmit and received bytes',
      }
    );

    this._meter.createBatchObserver(
      observerBatchResult => {
        Promise.all([
          getMemoryData(),
          getCpuUsageData(),
          getNetworkData(),
        ]).then(([memoryData, cpuUsage, networkData]) => {
          this._updateCpuTime(observerBatchResult, cpuUsage);
          this._updateCpuUtilisation(observerBatchResult, cpuUsage);
          this._updateMemUsage(observerBatchResult, memoryData);
          this._updateMemUtilization(observerBatchResult, memoryData);
          this._updateNetwork(observerBatchResult, networkData);
        });
      },
      {
        maxTimeoutUpdateMS: this._maxTimeoutUpdateMS,
      }
    );
  }

  /**
   * Starts collecting metrics
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
