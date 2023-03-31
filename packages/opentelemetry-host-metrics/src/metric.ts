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
import { throttle } from './util';

/**
 * Metrics Collector - collects metrics for CPU, Memory, Network
 */
export class HostMetrics extends BaseMetrics {
  private _updateCpuTime(
    observableResult: api.ObservableResult,
    cpuUsages: CpuUsageData[]
  ): void {
    for (let i = 0, j = cpuUsages.length; i < j; i++) {
      const cpuUsage = cpuUsages[i];
      observableResult.observe(cpuUsage.user, {
        state: enums.CPU_LABELS.USER,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUsage.system, {
        state: enums.CPU_LABELS.SYSTEM,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUsage.idle, {
        state: enums.CPU_LABELS.IDLE,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUsage.interrupt, {
        state: enums.CPU_LABELS.INTERRUPT,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUsage.nice, {
        state: enums.CPU_LABELS.NICE,
        cpu: cpuUsage.cpuNumber,
      });
    }
  }

  private _updateProcessCpuTime(
    observableResult: api.ObservableResult,
    processCpuUsage: ProcessCpuUsageData
  ): void {
    observableResult.observe(processCpuUsage.user, {
      state: enums.CPU_LABELS.USER,
    });
    observableResult.observe(processCpuUsage.system, {
      state: enums.CPU_LABELS.SYSTEM,
    });
  }

  private _updateCpuUtilization(
    observableResult: api.ObservableResult,
    cpuUsages: CpuUsageData[]
  ): void {
    for (let i = 0, j = cpuUsages.length; i < j; i++) {
      const cpuUsage = cpuUsages[i];
      observableResult.observe(cpuUsage.userP, {
        state: enums.CPU_LABELS.USER,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUsage.systemP, {
        state: enums.CPU_LABELS.SYSTEM,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUsage.idleP, {
        state: enums.CPU_LABELS.IDLE,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUsage.interruptP, {
        state: enums.CPU_LABELS.INTERRUPT,
        cpu: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUsage.niceP, {
        state: enums.CPU_LABELS.NICE,
        cpu: cpuUsage.cpuNumber,
      });
    }
  }

  private _updateProcessCpuUtilization(
    observableResult: api.ObservableResult,
    processCpuUsage: ProcessCpuUsageData
  ): void {
    observableResult.observe(processCpuUsage.userP, {
      state: enums.CPU_LABELS.USER,
    });
    observableResult.observe(processCpuUsage.systemP, {
      state: enums.CPU_LABELS.SYSTEM,
    });
  }

  private _updateMemUsage(
    observableResult: api.ObservableResult,
    memUsage: MemoryData
  ): void {
    observableResult.observe(memUsage.used, {
      state: enums.MEMORY_LABELS.USED,
    });
    observableResult.observe(memUsage.free, {
      state: enums.MEMORY_LABELS.FREE,
    });
  }

  private _updateMemUtilization(
    observableResult: api.ObservableResult,
    memUsage: MemoryData
  ): void {
    observableResult.observe(memUsage.usedP, {
      state: enums.MEMORY_LABELS.USED,
    });
    observableResult.observe(memUsage.freeP, {
      state: enums.MEMORY_LABELS.FREE,
    });
  }

  private _updateProcessMemUsage(
    observableResult: api.ObservableResult,
    memoryUsage: number
  ): void {
    observableResult.observe(memoryUsage);
  }

  private _updateNetworkDropped(
    observableResult: api.ObservableResult,
    networkUsages: NetworkData[]
  ): void {
    for (let i = 0, j = networkUsages.length; i < j; i++) {
      const networkUsage = networkUsages[i];
      observableResult.observe(networkUsage.rx_dropped, {
        [enums.NETWORK_LABELS.DEVICE]: networkUsage.iface,
        direction: enums.NETWORK_LABELS.RECEIVE,
      });
      observableResult.observe(networkUsage.tx_dropped, {
        device: networkUsage.iface,
        direction: enums.NETWORK_LABELS.TRANSMIT,
      });
    }
  }

  private _updateNetworkErrors(
    observableResult: api.ObservableResult,
    networkUsages: NetworkData[]
  ): void {
    for (let i = 0, j = networkUsages.length; i < j; i++) {
      const networkUsage = networkUsages[i];
      observableResult.observe(networkUsage.rx_errors, {
        device: networkUsage.iface,
        direction: enums.NETWORK_LABELS.RECEIVE,
      });
      observableResult.observe(networkUsage.tx_errors, {
        device: networkUsage.iface,
        direction: enums.NETWORK_LABELS.TRANSMIT,
      });
    }
  }

  private _updateNetworkIO(
    observableResult: api.ObservableResult,
    networkUsages: NetworkData[]
  ): void {
    for (let i = 0, j = networkUsages.length; i < j; i++) {
      const networkUsage = networkUsages[i];
      observableResult.observe(networkUsage.rx_bytes, {
        device: networkUsage.iface,
        direction: enums.NETWORK_LABELS.RECEIVE,
      });
      observableResult.observe(networkUsage.tx_bytes, {
        device: networkUsage.iface,
        direction: enums.NETWORK_LABELS.TRANSMIT,
      });
    }
  }

  /**
   * Creates metrics
   */
  protected _createMetrics(): void {
    this._meter
      .createObservableCounter(enums.METRIC_NAMES.CPU_TIME, {
        description: 'Cpu time in seconds',
        unit: 's',
      })
      .addCallback(observableResult => {
        const cpuUsageData = this._getCpuUsageData();
        this._updateCpuTime(observableResult, cpuUsageData);
      });
    this._meter
      .createObservableGauge(enums.METRIC_NAMES.CPU_UTILIZATION, {
        description: 'Cpu usage time 0-1',
      })
      .addCallback(observableResult => {
        const cpuUsageData = this._getCpuUsageData();
        this._updateCpuUtilization(observableResult, cpuUsageData);
      });
    this._meter
      .createObservableGauge(enums.METRIC_NAMES.MEMORY_USAGE, {
        description: 'Memory usage in bytes',
      })
      .addCallback(observableResult => {
        const memoryUsageData = this._getMemoryData();
        this._updateMemUsage(observableResult, memoryUsageData);
      });
    this._meter
      .createObservableGauge(enums.METRIC_NAMES.MEMORY_UTILIZATION, {
        description: 'Memory usage 0-1',
      })
      .addCallback(observableResult => {
        const memoryUsageData = this._getMemoryData();
        this._updateMemUtilization(observableResult, memoryUsageData);
      });
    this._meter
      .createObservableCounter(enums.METRIC_NAMES.NETWORK_DROPPED, {
        description: 'Network dropped packets',
      })
      .addCallback(async observableResult => {
        const networkData = await this._getNetworkData();
        this._updateNetworkDropped(observableResult, networkData);
      });
    this._meter
      .createObservableCounter(enums.METRIC_NAMES.NETWORK_ERRORS, {
        description: 'Network errors counter',
      })
      .addCallback(async observableResult => {
        const networkData = await this._getNetworkData();
        this._updateNetworkErrors(observableResult, networkData);
      });
    this._meter
      .createObservableCounter(enums.METRIC_NAMES.NETWORK_IO, {
        description: 'Network transmit and received bytes',
      })
      .addCallback(async observableResult => {
        const networkData = await this._getNetworkData();
        this._updateNetworkIO(observableResult, networkData);
      });
    this._meter
      .createObservableCounter(enums.METRIC_NAMES.PROCESS_CPU_TIME, {
        description: 'Process Cpu time in seconds',
        unit: 's',
      })
      .addCallback(observableResult => {
        const processCpuUsageData = this._getProcessCpuUsageData();
        this._updateProcessCpuTime(observableResult, processCpuUsageData);
      });
    this._meter
      .createObservableGauge(enums.METRIC_NAMES.PROCESS_CPU_UTILIZATION, {
        description: 'Process Cpu usage time 0-1',
      })
      .addCallback(observableResult => {
        const processCpuUsageData = this._getProcessCpuUsageData();
        this._updateProcessCpuUtilization(
          observableResult,
          processCpuUsageData
        );
      });
    this._meter
      .createObservableGauge(enums.METRIC_NAMES.PROCESS_MEMORY_USAGE, {
        description: 'Process Memory usage in bytes',
      })
      .addCallback(observableResult => {
        const processMemoryData = this._getProcessMemoryData();
        this._updateProcessMemUsage(observableResult, processMemoryData);
      });
  }

  /**
   * Starts collecting metrics
   */
  start() {
    this._createMetrics();
  }

  private _getMemoryData = throttle(getMemoryData, this._maxTimeoutUpdateMS);
  private _getCpuUsageData = throttle(
    getCpuUsageData,
    this._maxTimeoutUpdateMS
  );
  private _getNetworkData = throttle(getNetworkData, this._maxTimeoutUpdateMS);
  private _getProcessCpuUsageData = throttle(
    getProcessCpuUsageData,
    this._maxTimeoutUpdateMS
  );
  private _getProcessMemoryData = throttle(
    getProcessMemoryData,
    this._maxTimeoutUpdateMS
  );
}
