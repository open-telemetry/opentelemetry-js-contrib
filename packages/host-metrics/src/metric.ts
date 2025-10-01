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
import {
  BatchObservableResult,
  ObservableCounter,
  ObservableGauge,
} from '@opentelemetry/api';
import {
  ATTR_NETWORK_IO_DIRECTION,
  ATTR_PROCESS_CPU_STATE,
  ATTR_SYSTEM_CPU_LOGICAL_NUMBER,
  ATTR_SYSTEM_CPU_STATE,
  ATTR_SYSTEM_DEVICE,
  ATTR_SYSTEM_MEMORY_STATE,
  METRIC_PROCESS_CPU_TIME,
  METRIC_PROCESS_CPU_UTILIZATION,
  METRIC_PROCESS_MEMORY_USAGE,
  METRIC_SYSTEM_CPU_TIME,
  METRIC_SYSTEM_CPU_UTILIZATION,
  METRIC_SYSTEM_MEMORY_USAGE,
  METRIC_SYSTEM_MEMORY_UTILIZATION,
  METRIC_SYSTEM_NETWORK_ERRORS,
  METRIC_SYSTEM_NETWORK_IO,
  NETWORK_IO_DIRECTION_VALUE_RECEIVE,
  NETWORK_IO_DIRECTION_VALUE_TRANSMIT,
  PROCESS_CPU_STATE_VALUE_SYSTEM,
  PROCESS_CPU_STATE_VALUE_USER,
  SYSTEM_CPU_STATE_VALUE_IDLE,
  SYSTEM_CPU_STATE_VALUE_INTERRUPT,
  SYSTEM_CPU_STATE_VALUE_NICE,
  SYSTEM_CPU_STATE_VALUE_SYSTEM,
  SYSTEM_CPU_STATE_VALUE_USER,
  SYSTEM_MEMORY_STATE_VALUE_FREE,
  SYSTEM_MEMORY_STATE_VALUE_USED,
} from './semconv';

import {
  getCpuUsageData,
  getMemoryData,
  getProcessCpuUsageData,
  getProcessMemoryData,
} from './stats/common';
import { getNetworkData } from './stats/si';
import type { CpuUsageData, MemoryData, ProcessCpuUsageData } from './types';
import type { Systeminformation } from 'systeminformation';

/**
 * Metrics Collector - collects metrics for CPU, Memory, Network
 */
export class HostMetrics extends BaseMetrics {
  private _batchUpdateCpuUsages(
    observableResult: BatchObservableResult,
    cpuUsages: CpuUsageData[]
  ): void {
    for (let i = 0, j = cpuUsages.length; i < j; i++) {
      const cpuUsage = cpuUsages[i];
      observableResult.observe(this._cpuTime, cpuUsage.user, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_USER,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.system, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_SYSTEM,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.idle, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_IDLE,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.interrupt, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_INTERRUPT,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.nice, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_NICE,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });

      observableResult.observe(this._cpuUtilization, cpuUsage.userP, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_USER,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.systemP, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_SYSTEM,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.idleP, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_IDLE,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.interruptP, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_INTERRUPT,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.niceP, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_NICE,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
    }
  }

  private _batchUpdateProcessCpuUsages(
    observableResult: BatchObservableResult,
    processCpuUsage: ProcessCpuUsageData
  ): void {
    observableResult.observe(this._processCpuTime, processCpuUsage.user, {
      [ATTR_PROCESS_CPU_STATE]: PROCESS_CPU_STATE_VALUE_USER,
    });
    observableResult.observe(this._processCpuTime, processCpuUsage.system, {
      [ATTR_PROCESS_CPU_STATE]: PROCESS_CPU_STATE_VALUE_SYSTEM,
    });

    observableResult.observe(
      this._processCpuUtilization,
      processCpuUsage.userP,
      {
        [ATTR_PROCESS_CPU_STATE]: PROCESS_CPU_STATE_VALUE_USER,
      }
    );
    observableResult.observe(
      this._processCpuUtilization,
      processCpuUsage.systemP,
      {
        [ATTR_PROCESS_CPU_STATE]: PROCESS_CPU_STATE_VALUE_SYSTEM,
      }
    );
  }

  private _batchUpdateMemUsages(
    observableResult: BatchObservableResult,
    memUsage: MemoryData
  ): void {
    observableResult.observe(this._memoryUsage, memUsage.used, {
      [ATTR_SYSTEM_MEMORY_STATE]: SYSTEM_MEMORY_STATE_VALUE_USED,
    });
    observableResult.observe(this._memoryUsage, memUsage.free, {
      [ATTR_SYSTEM_MEMORY_STATE]: SYSTEM_MEMORY_STATE_VALUE_FREE,
    });

    observableResult.observe(this._memoryUtilization, memUsage.usedP, {
      [ATTR_SYSTEM_MEMORY_STATE]: SYSTEM_MEMORY_STATE_VALUE_USED,
    });
    observableResult.observe(this._memoryUtilization, memUsage.freeP, {
      [ATTR_SYSTEM_MEMORY_STATE]: SYSTEM_MEMORY_STATE_VALUE_FREE,
    });
  }

  private _batchUpdateProcessMemUsage(
    observableResult: BatchObservableResult,
    memoryUsage: number
  ): void {
    observableResult.observe(this._processMemoryUsage, memoryUsage);
  }

  private _batchUpdateNetworkData(
    observableResult: BatchObservableResult,
    networkUsages: Systeminformation.NetworkStatsData[]
  ): void {
    for (let i = 0, j = networkUsages.length; i < j; i++) {
      const networkUsage = networkUsages[i];
      observableResult.observe(this._networkDropped, networkUsage.rx_dropped, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_RECEIVE,
      });
      observableResult.observe(this._networkDropped, networkUsage.tx_dropped, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_TRANSMIT,
      });

      observableResult.observe(this._networkErrors, networkUsage.rx_errors, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_RECEIVE,
      });
      observableResult.observe(this._networkErrors, networkUsage.tx_errors, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_TRANSMIT,
      });

      observableResult.observe(this._networkIo, networkUsage.rx_bytes, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_RECEIVE,
      });
      observableResult.observe(this._networkIo, networkUsage.tx_bytes, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_TRANSMIT,
      });
    }
  }

  /**
   * Creates metrics
   */
  protected _createMetrics(): void {
    this._cpuTime = this._meter.createObservableCounter(
      METRIC_SYSTEM_CPU_TIME,
      {
        description: 'Cpu time in seconds',
        unit: 's',
      }
    );
    this._cpuUtilization = this._meter.createObservableGauge(
      METRIC_SYSTEM_CPU_UTILIZATION,
      {
        description: 'Cpu usage time 0-1',
      }
    );

    this._memoryUsage = this._meter.createObservableGauge(
      METRIC_SYSTEM_MEMORY_USAGE,
      {
        description: 'Memory usage in bytes',
      }
    );
    this._memoryUtilization = this._meter.createObservableGauge(
      METRIC_SYSTEM_MEMORY_UTILIZATION,
      {
        description: 'Memory usage 0-1',
      }
    );

    this._networkDropped = this._meter.createObservableCounter(
      // There is no semconv pkg export for this in v1.37.0 because
      // https://github.com/open-telemetry/semantic-conventions/issues/2828.
      // TODO: update to `METRIC_SYSTEM_NETWORK_PACKET_DROPPED` (breaking change)
      'system.network.dropped',
      {
        description: 'Network dropped packets',
      }
    );
    this._networkErrors = this._meter.createObservableCounter(
      METRIC_SYSTEM_NETWORK_ERRORS,
      {
        description: 'Network errors counter',
      }
    );
    this._networkIo = this._meter.createObservableCounter(
      METRIC_SYSTEM_NETWORK_IO,
      {
        description: 'Network transmit and received bytes',
      }
    );

    this._processCpuTime = this._meter.createObservableCounter(
      METRIC_PROCESS_CPU_TIME,
      {
        description: 'Process Cpu time in seconds',
        unit: 's',
      }
    );
    this._processCpuUtilization = this._meter.createObservableGauge(
      METRIC_PROCESS_CPU_UTILIZATION,
      {
        description: 'Process Cpu usage time 0-1',
      }
    );
    this._processMemoryUsage = this._meter.createObservableGauge(
      METRIC_PROCESS_MEMORY_USAGE,
      {
        description: 'Process Memory usage in bytes',
      }
    );

    this._meter.addBatchObservableCallback(
      async observableResult => {
        const cpuUsages = getCpuUsageData();
        const memoryUsages = getMemoryData();
        const processCpuUsages = getProcessCpuUsageData();
        const processMemoryUsages = getProcessMemoryData();
        const networkData = await getNetworkData();

        this._batchUpdateCpuUsages(observableResult, cpuUsages);
        this._batchUpdateMemUsages(observableResult, memoryUsages);
        this._batchUpdateProcessCpuUsages(observableResult, processCpuUsages);
        this._batchUpdateProcessMemUsage(observableResult, processMemoryUsages);
        this._batchUpdateNetworkData(observableResult, networkData);
      },
      [
        this._cpuTime,
        this._cpuUtilization,
        this._memoryUsage,
        this._memoryUtilization,
        this._processCpuTime,
        this._processCpuUtilization,
        this._processMemoryUsage,
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
  private _cpuTime!: ObservableCounter;
  private _cpuUtilization!: ObservableGauge;
  private _memoryUsage!: ObservableGauge;
  private _memoryUtilization!: ObservableGauge;
  private _processCpuTime!: ObservableCounter;
  private _processCpuUtilization!: ObservableGauge;
  private _processMemoryUsage!: ObservableGauge;
  private _networkDropped!: ObservableCounter;
  private _networkErrors!: ObservableCounter;
  private _networkIo!: ObservableCounter;
}
