/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstrumentationBase } from '@opentelemetry/instrumentation';
import {
  Attributes,
  BatchObservableCallback,
  BatchObservableResult,
  Observable,
  ObservableCounter,
  ObservableGauge,
} from '@opentelemetry/api';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';
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
import type {
  CpuUsageData,
  HostMetricsInstrumentationConfig,
  MemoryData,
  ProcessCpuUsageData,
} from './types';
import type { Systeminformation } from 'systeminformation';

export class HostMetricsInstrumentation extends InstrumentationBase<HostMetricsInstrumentationConfig> {
  private _batchCallback?: BatchObservableCallback<Attributes>;
  private _observables: Observable[] = [];

  constructor(config: HostMetricsInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  init() {}

  // Called by the SDK when a MeterProvider is set or changed.
  override _updateMetricInstruments() {
    // The previous meter is gone — clear stale references and re-register on the new meter.
    this._observables = [];
    this._batchCallback = undefined;
    if (this.isEnabled()) {
      this._doRegister();
    }
  }

  override enable() {
    super.enable();
    if (!this._batchCallback) {
      this._doRegister();
    }
  }

  override disable() {
    super.disable();
    this._doUnregister();
  }

  private _doUnregister() {
    if (this._batchCallback && this._observables.length > 0) {
      this.meter.removeBatchObservableCallback(
        this._batchCallback,
        this._observables
      );
    }
    this._observables = [];
    this._batchCallback = undefined;
  }

  private _doRegister() {
    const metricGroups = this._config.metricGroups;
    const systemCpuGroupEnabled =
      !metricGroups || metricGroups.includes('system.cpu');
    const systemMemoryGroupEnabled =
      !metricGroups || metricGroups.includes('system.memory');
    const systemNetworkGroupEnabled =
      !metricGroups || metricGroups.includes('system.network');
    const processCpuGroupEnabled =
      !metricGroups || metricGroups.includes('process.cpu');
    const processMemoryGroupEnabled =
      !metricGroups || metricGroups.includes('process.memory');

    const observables: Observable[] = [];
    let cpuTime: ObservableCounter | undefined;
    let cpuUtilization: ObservableGauge | undefined;
    let memoryUsage: ObservableGauge | undefined;
    let memoryUtilization: ObservableGauge | undefined;
    let processCpuTime: ObservableCounter | undefined;
    let processCpuUtilization: ObservableGauge | undefined;
    let processMemoryUsage: ObservableGauge | undefined;
    let networkDropped: ObservableCounter | undefined;
    let networkErrors: ObservableCounter | undefined;
    let networkIo: ObservableCounter | undefined;

    if (systemCpuGroupEnabled) {
      cpuTime = this.meter.createObservableCounter(METRIC_SYSTEM_CPU_TIME, {
        description: 'Cpu time in seconds',
        unit: 's',
      });
      observables.push(cpuTime);
      cpuUtilization = this.meter.createObservableGauge(
        METRIC_SYSTEM_CPU_UTILIZATION,
        { description: 'Cpu usage time 0-1' }
      );
      observables.push(cpuUtilization);
    }

    if (systemMemoryGroupEnabled) {
      memoryUsage = this.meter.createObservableGauge(
        METRIC_SYSTEM_MEMORY_USAGE,
        { description: 'Memory usage in bytes' }
      );
      observables.push(memoryUsage);
      memoryUtilization = this.meter.createObservableGauge(
        METRIC_SYSTEM_MEMORY_UTILIZATION,
        { description: 'Memory usage 0-1' }
      );
      observables.push(memoryUtilization);
    }

    if (systemNetworkGroupEnabled) {
      networkDropped = this.meter.createObservableCounter(
        // There is no semconv pkg export for this in v1.37.0 because
        // https://github.com/open-telemetry/semantic-conventions/issues/2828.
        // TODO: update to `METRIC_SYSTEM_NETWORK_PACKET_DROPPED` (breaking change)
        'system.network.dropped',
        { description: 'Network dropped packets' }
      );
      observables.push(networkDropped);
      networkErrors = this.meter.createObservableCounter(
        METRIC_SYSTEM_NETWORK_ERRORS,
        { description: 'Network errors counter' }
      );
      observables.push(networkErrors);
      networkIo = this.meter.createObservableCounter(METRIC_SYSTEM_NETWORK_IO, {
        description: 'Network transmit and received bytes',
      });
      observables.push(networkIo);
    }

    if (processCpuGroupEnabled) {
      processCpuTime = this.meter.createObservableCounter(
        METRIC_PROCESS_CPU_TIME,
        { description: 'Process Cpu time in seconds', unit: 's' }
      );
      observables.push(processCpuTime);
      processCpuUtilization = this.meter.createObservableGauge(
        METRIC_PROCESS_CPU_UTILIZATION,
        { description: 'Process Cpu usage time 0-1' }
      );
      observables.push(processCpuUtilization);
    }

    if (processMemoryGroupEnabled) {
      processMemoryUsage = this.meter.createObservableGauge(
        METRIC_PROCESS_MEMORY_USAGE,
        { description: 'Process Memory usage in bytes' }
      );
      observables.push(processMemoryUsage);
    }

    this._batchCallback = async (observableResult: BatchObservableResult) => {
      if (systemCpuGroupEnabled) {
        const cpuUsages = getCpuUsageData();
        this._batchUpdateCpuUsages(
          observableResult,
          cpuUsages,
          cpuTime!,
          cpuUtilization!
        );
      }
      if (systemMemoryGroupEnabled) {
        const memoryData = getMemoryData();
        this._batchUpdateMemUsages(
          observableResult,
          memoryData,
          memoryUsage!,
          memoryUtilization!
        );
      }
      if (processCpuGroupEnabled) {
        const processCpuUsage = getProcessCpuUsageData();
        this._batchUpdateProcessCpuUsages(
          observableResult,
          processCpuUsage,
          processCpuTime!,
          processCpuUtilization!
        );
      }
      if (processMemoryGroupEnabled) {
        const processMemory = getProcessMemoryData();
        this._batchUpdateProcessMemUsage(
          observableResult,
          processMemory,
          processMemoryUsage!
        );
      }
      if (systemNetworkGroupEnabled) {
        const networkData = await getNetworkData();
        this._batchUpdateNetworkData(
          observableResult,
          networkData,
          networkDropped!,
          networkErrors!,
          networkIo!
        );
      }
    };

    this.meter.addBatchObservableCallback(this._batchCallback, observables);
    this._observables = observables;
  }

  private _batchUpdateCpuUsages(
    observableResult: BatchObservableResult,
    cpuUsages: CpuUsageData[],
    cpuTime: ObservableCounter,
    cpuUtilization: ObservableGauge
  ): void {
    for (let i = 0, j = cpuUsages.length; i < j; i++) {
      const cpuUsage = cpuUsages[i];
      observableResult.observe(cpuTime, cpuUsage.user, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_USER,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuTime, cpuUsage.system, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_SYSTEM,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuTime, cpuUsage.idle, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_IDLE,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuTime, cpuUsage.interrupt, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_INTERRUPT,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuTime, cpuUsage.nice, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_NICE,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });

      observableResult.observe(cpuUtilization, cpuUsage.userP, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_USER,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUtilization, cpuUsage.systemP, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_SYSTEM,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUtilization, cpuUsage.idleP, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_IDLE,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUtilization, cpuUsage.interruptP, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_INTERRUPT,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
      observableResult.observe(cpuUtilization, cpuUsage.niceP, {
        [ATTR_SYSTEM_CPU_STATE]: SYSTEM_CPU_STATE_VALUE_NICE,
        [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
      });
    }
  }

  private _batchUpdateProcessCpuUsages(
    observableResult: BatchObservableResult,
    processCpuUsage: ProcessCpuUsageData,
    processCpuTime: ObservableCounter,
    processCpuUtilization: ObservableGauge
  ): void {
    observableResult.observe(processCpuTime, processCpuUsage.user, {
      [ATTR_PROCESS_CPU_STATE]: PROCESS_CPU_STATE_VALUE_USER,
    });
    observableResult.observe(processCpuTime, processCpuUsage.system, {
      [ATTR_PROCESS_CPU_STATE]: PROCESS_CPU_STATE_VALUE_SYSTEM,
    });
    observableResult.observe(processCpuUtilization, processCpuUsage.userP, {
      [ATTR_PROCESS_CPU_STATE]: PROCESS_CPU_STATE_VALUE_USER,
    });
    observableResult.observe(processCpuUtilization, processCpuUsage.systemP, {
      [ATTR_PROCESS_CPU_STATE]: PROCESS_CPU_STATE_VALUE_SYSTEM,
    });
  }

  private _batchUpdateMemUsages(
    observableResult: BatchObservableResult,
    memUsage: MemoryData,
    memoryUsage: ObservableGauge,
    memoryUtilization: ObservableGauge
  ): void {
    observableResult.observe(memoryUsage, memUsage.used, {
      [ATTR_SYSTEM_MEMORY_STATE]: SYSTEM_MEMORY_STATE_VALUE_USED,
    });
    observableResult.observe(memoryUsage, memUsage.free, {
      [ATTR_SYSTEM_MEMORY_STATE]: SYSTEM_MEMORY_STATE_VALUE_FREE,
    });
    observableResult.observe(memoryUtilization, memUsage.usedP, {
      [ATTR_SYSTEM_MEMORY_STATE]: SYSTEM_MEMORY_STATE_VALUE_USED,
    });
    observableResult.observe(memoryUtilization, memUsage.freeP, {
      [ATTR_SYSTEM_MEMORY_STATE]: SYSTEM_MEMORY_STATE_VALUE_FREE,
    });
  }

  private _batchUpdateProcessMemUsage(
    observableResult: BatchObservableResult,
    memoryUsage: number,
    processMemoryUsage: ObservableGauge
  ): void {
    observableResult.observe(processMemoryUsage, memoryUsage);
  }

  private _batchUpdateNetworkData(
    observableResult: BatchObservableResult,
    networkUsages: Systeminformation.NetworkStatsData[],
    networkDropped: ObservableCounter,
    networkErrors: ObservableCounter,
    networkIo: ObservableCounter
  ): void {
    for (let i = 0, j = networkUsages.length; i < j; i++) {
      const networkUsage = networkUsages[i];
      observableResult.observe(networkDropped, networkUsage.rx_dropped, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_RECEIVE,
      });
      observableResult.observe(networkDropped, networkUsage.tx_dropped, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_TRANSMIT,
      });
      observableResult.observe(networkErrors, networkUsage.rx_errors, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_RECEIVE,
      });
      observableResult.observe(networkErrors, networkUsage.tx_errors, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_TRANSMIT,
      });
      observableResult.observe(networkIo, networkUsage.rx_bytes, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_RECEIVE,
      });
      observableResult.observe(networkIo, networkUsage.tx_bytes, {
        [ATTR_SYSTEM_DEVICE]: networkUsage.iface,
        [ATTR_NETWORK_IO_DIRECTION]: NETWORK_IO_DIRECTION_VALUE_TRANSMIT,
      });
    }
  }
}
