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
import * as api from '@opentelemetry/api';
import * as enums from './enum';

import { getCpuUsageData, getMemoryData } from './stats/common';
import { getNetworkData } from './stats/si';
import { CpuUsageData, MemoryData, NetworkData } from './types';

/**
 * Metrics Collector - collects metrics for CPU, Memory, Network
 */
export class HostMetrics extends BaseMetrics {
  private _batchUpdateCpuUsages(
    observableResult: api.BatchObservableResult,
    cpuUsages: CpuUsageData[]
  ): void {
    for (let i = 0, j = cpuUsages.length; i < j; i++) {
      const cpuUsage = cpuUsages[i];
      observableResult.observe(this._cpuTime, cpuUsage.user, {
        state: enums.CPU_LABELS.USER,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.system, {
        state: enums.CPU_LABELS.SYSTEM,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.idle, {
        state: enums.CPU_LABELS.IDLE,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.interrupt, {
        state: enums.CPU_LABELS.INTERRUPT,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.nice, {
        state: enums.CPU_LABELS.NICE,
        cpu: cpuUsage.cpuNumber,
      });

      observableResult.observe(this._cpuUtilization, cpuUsage.userP, {
        state: enums.CPU_LABELS.USER,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.systemP, {
        state: enums.CPU_LABELS.SYSTEM,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.idleP, {
        state: enums.CPU_LABELS.IDLE,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.interruptP, {
        state: enums.CPU_LABELS.INTERRUPT,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.niceP, {
        state: enums.CPU_LABELS.NICE,
        cpu: cpuUsage.cpuNumber,
      });
    }
  }

  private _updateMemUsage(
    observableResult: api.BatchObservableResult,
    memUsage: MemoryData
  ): void {
    observableResult.observe(this._memoryUsage, memUsage.used, {
      state: enums.MEMORY_LABELS.USED,
    });
    observableResult.observe(this._memoryUsage, memUsage.free, {
      state: enums.MEMORY_LABELS.FREE,
    });

    observableResult.observe(this._memoryUtilization, memUsage.usedP, {
      state: enums.MEMORY_LABELS.USED,
    });
    observableResult.observe(this._memoryUtilization, memUsage.freeP, {
      state: enums.MEMORY_LABELS.FREE,
    });
  }

  private _updateNetworkData(
    observableResult: api.BatchObservableResult,
    networkUsages: NetworkData[]
  ): void {
    for (let i = 0, j = networkUsages.length; i < j; i++) {
      const networkUsage = networkUsages[i];
      observableResult.observe(this._networkDropped, networkUsage.rx_dropped, {
        [enums.NETWORK_LABELS.DEVICE]: networkUsage.iface,
        direction: enums.NETWORK_LABELS.RECEIVE,
      });
      observableResult.observe(this._networkDropped, networkUsage.tx_dropped, {
        device: networkUsage.iface,
        direction: enums.NETWORK_LABELS.TRANSMIT,
      });

      observableResult.observe(this._networkErrors, networkUsage.rx_errors, {
        device: networkUsage.iface,
        direction: enums.NETWORK_LABELS.RECEIVE,
      });
      observableResult.observe(this._networkErrors, networkUsage.tx_errors, {
        device: networkUsage.iface,
        direction: enums.NETWORK_LABELS.TRANSMIT,
      });

      observableResult.observe(this._networkIo, networkUsage.rx_bytes, {
        device: networkUsage.iface,
        direction: enums.NETWORK_LABELS.RECEIVE,
      });
      observableResult.observe(this._networkIo, networkUsage.tx_bytes, {
        device: networkUsage.iface,
        direction: enums.NETWORK_LABELS.TRANSMIT,
      });
    }
  }

  /**
   * Creates metrics
   */
  protected _createMetrics(): void {
    this._cpuTime = this._meter.createObservableCounter(
      enums.METRIC_NAMES.CPU_TIME,
      {
        description: 'Cpu time in seconds',
        unit: 's',
      }
    );
    this._cpuUtilization = this._meter.createObservableGauge(
      enums.METRIC_NAMES.CPU_UTILIZATION,
      {
        description: 'Cpu usage time 0-1',
      }
    );

    this._memoryUsage = this._meter.createObservableGauge(
      enums.METRIC_NAMES.MEMORY_USAGE,
      {
        description: 'Memory usage in bytes',
      }
    );
    this._memoryUtilization = this._meter.createObservableGauge(
      enums.METRIC_NAMES.MEMORY_UTILIZATION,
      {
        description: 'Memory usage 0-1',
      }
    );

    this._networkDropped = this._meter.createObservableCounter(
      enums.METRIC_NAMES.NETWORK_DROPPED,
      {
        description: 'Network dropped packets',
      }
    );
    this._networkErrors = this._meter.createObservableCounter(
      enums.METRIC_NAMES.NETWORK_ERRORS,
      {
        description: 'Network errors counter',
      }
    );
    this._networkIo = this._meter.createObservableCounter(
      enums.METRIC_NAMES.NETWORK_IO,
      {
        description: 'Network transmit and received bytes',
      }
    );

    this._meter.addBatchObservableCallback(
      async observableResult => {
        const cpuUsages = getCpuUsageData();
        const memoryUsage = getMemoryData();
        const networkData = await getNetworkData();

        this._batchUpdateCpuUsages(observableResult, cpuUsages);
        this._updateMemUsage(observableResult, memoryUsage);
        this._updateNetworkData(observableResult, networkData);
      },
      [
        this._cpuTime,
        this._cpuUtilization,
        this._memoryUsage,
        this._memoryUtilization,
        this._networkDropped,
        this._networkErrors,
        this._networkIo,
      ]
    );
  }

  /**
   * Starts collecting metrics
   */
  start() {
    this._createMetrics();
  }

  // The metrics are created in `_createMetrics`.
  private _cpuTime!: api.ObservableCounter;
  private _cpuUtilization!: api.ObservableGauge;
  private _memoryUsage!: api.ObservableGauge;
  private _memoryUtilization!: api.ObservableGauge;
  private _networkDropped!: api.ObservableCounter;
  private _networkErrors!: api.ObservableCounter;
  private _networkIo!: api.ObservableCounter;
}
