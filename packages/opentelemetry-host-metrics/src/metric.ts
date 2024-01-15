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

import {
  getCpuUsageData,
  getMemoryData,
  getProcessCpuUsageData,
  getProcessMemoryData,
} from './stats/common';
import { getNetworkData } from './stats/si';
import {
  CpuUsageData,
  MemoryData,
  NetworkData,
  ProcessCpuUsageData,
} from './types';

/**
 * Metrics Collector - collects metrics for CPU, Memory, Network
 */
export class HostMetrics extends BaseMetrics {
  private _batchUpdateCpuUsages(
    observableResult: api.BatchObservableResult,
    cpuUsages: CpuUsageData[]
  ): void {
    const stateAttr = enums.ATTRIBUTE_NAMES.SYSTEM_CPU_STATE;
    const cpuAttr = enums.ATTRIBUTE_NAMES.SYSTEM_CPU_LOGICAL_NUMBER;

    for (let i = 0, j = cpuUsages.length; i < j; i++) {
      const cpuUsage = cpuUsages[i];
      observableResult.observe(this._cpuTime, cpuUsage.user, {
        [stateAttr]: enums.CPU_LABELS.USER,
        [cpuAttr]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.system, {
        [stateAttr]: enums.CPU_LABELS.SYSTEM,
        [cpuAttr]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.idle, {
        [stateAttr]: enums.CPU_LABELS.IDLE,
        [cpuAttr]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.interrupt, {
        [stateAttr]: enums.CPU_LABELS.INTERRUPT,
        [cpuAttr]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuTime, cpuUsage.nice, {
        [stateAttr]: enums.CPU_LABELS.NICE,
        [cpuAttr]: cpuUsage.cpuNumber,
      });

      observableResult.observe(this._cpuUtilization, cpuUsage.userP, {
        [stateAttr]: enums.CPU_LABELS.USER,
        [cpuAttr]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.systemP, {
        [stateAttr]: enums.CPU_LABELS.SYSTEM,
        [cpuAttr]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.idleP, {
        [stateAttr]: enums.CPU_LABELS.IDLE,
        [cpuAttr]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.interruptP, {
        [stateAttr]: enums.CPU_LABELS.INTERRUPT,
        [cpuAttr]: cpuUsage.cpuNumber,
      });
      observableResult.observe(this._cpuUtilization, cpuUsage.niceP, {
        [stateAttr]: enums.CPU_LABELS.NICE,
        [cpuAttr]: cpuUsage.cpuNumber,
      });
    }
  }

  private _batchUpdateProcessCpuUsages(
    observableResult: api.BatchObservableResult,
    processCpuUsage: ProcessCpuUsageData
  ): void {
    const stateAttr = enums.ATTRIBUTE_NAMES.PROCESS_CPU_STATE;

    observableResult.observe(this._processCpuTime, processCpuUsage.user, {
      [stateAttr]: enums.CPU_LABELS.USER,
    });
    observableResult.observe(this._processCpuTime, processCpuUsage.system, {
      [stateAttr]: enums.CPU_LABELS.SYSTEM,
    });

    observableResult.observe(
      this._processCpuUtilization,
      processCpuUsage.userP,
      {
        [stateAttr]: enums.CPU_LABELS.USER,
      }
    );
    observableResult.observe(
      this._processCpuUtilization,
      processCpuUsage.systemP,
      {
        [stateAttr]: enums.CPU_LABELS.SYSTEM,
      }
    );
  }

  private _batchUpdateMemUsages(
    observableResult: api.BatchObservableResult,
    memUsage: MemoryData
  ): void {
    const stateAttr = enums.ATTRIBUTE_NAMES.SYSTEM_MEMORY_STATE;

    observableResult.observe(this._memoryUsage, memUsage.used, {
      [stateAttr]: enums.MEMORY_LABELS.USED,
    });
    observableResult.observe(this._memoryUsage, memUsage.free, {
      [stateAttr]: enums.MEMORY_LABELS.FREE,
    });

    observableResult.observe(this._memoryUtilization, memUsage.usedP, {
      [stateAttr]: enums.MEMORY_LABELS.USED,
    });
    observableResult.observe(this._memoryUtilization, memUsage.freeP, {
      [stateAttr]: enums.MEMORY_LABELS.FREE,
    });
  }

  private _batchUpdateProcessMemUsage(
    observableResult: api.BatchObservableResult,
    memoryUsage: number
  ): void {
    observableResult.observe(this._processMemoryUsage, memoryUsage);
  }

  private _batchUpdateNetworkData(
    observableResult: api.BatchObservableResult,
    networkUsages: NetworkData[]
  ): void {
    const deviceAttr = enums.ATTRIBUTE_NAMES.SYSTEM_DEVICE;
    const directionAttr = enums.ATTRIBUTE_NAMES.SYSTEM_NETWORK_DIRECTION;

    for (let i = 0, j = networkUsages.length; i < j; i++) {
      const networkUsage = networkUsages[i];
      observableResult.observe(this._networkDropped, networkUsage.rx_dropped, {
        [deviceAttr]: networkUsage.iface,
        [directionAttr]: enums.NETWORK_LABELS.RECEIVE,
      });
      observableResult.observe(this._networkDropped, networkUsage.tx_dropped, {
        [deviceAttr]: networkUsage.iface,
        [directionAttr]: enums.NETWORK_LABELS.TRANSMIT,
      });

      observableResult.observe(this._networkErrors, networkUsage.rx_errors, {
        [deviceAttr]: networkUsage.iface,
        [directionAttr]: enums.NETWORK_LABELS.RECEIVE,
      });
      observableResult.observe(this._networkErrors, networkUsage.tx_errors, {
        [deviceAttr]: networkUsage.iface,
        [directionAttr]: enums.NETWORK_LABELS.TRANSMIT,
      });

      observableResult.observe(this._networkIo, networkUsage.rx_bytes, {
        [deviceAttr]: networkUsage.iface,
        [directionAttr]: enums.NETWORK_LABELS.RECEIVE,
      });
      observableResult.observe(this._networkIo, networkUsage.tx_bytes, {
        [deviceAttr]: networkUsage.iface,
        [directionAttr]: enums.NETWORK_LABELS.TRANSMIT,
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

    this._processCpuTime = this._meter.createObservableCounter(
      enums.METRIC_NAMES.PROCESS_CPU_TIME,
      {
        description: 'Process Cpu time in seconds',
        unit: 's',
      }
    );
    this._processCpuUtilization = this._meter.createObservableGauge(
      enums.METRIC_NAMES.PROCESS_CPU_UTILIZATION,
      {
        description: 'Process Cpu usage time 0-1',
      }
    );
    this._processMemoryUsage = this._meter.createObservableGauge(
      enums.METRIC_NAMES.PROCESS_MEMORY_USAGE,
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
  private _cpuTime!: api.ObservableCounter;
  private _cpuUtilization!: api.ObservableGauge;
  private _memoryUsage!: api.ObservableGauge;
  private _memoryUtilization!: api.ObservableGauge;
  private _processCpuTime!: api.ObservableCounter;
  private _processCpuUtilization!: api.ObservableGauge;
  private _processMemoryUsage!: api.ObservableGauge;
  private _networkDropped!: api.ObservableCounter;
  private _networkErrors!: api.ObservableCounter;
  private _networkIo!: api.ObservableCounter;
}
