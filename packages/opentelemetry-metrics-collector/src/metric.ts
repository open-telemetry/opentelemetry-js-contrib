/*!
 * Copyright 2020, OpenTelemetry Authors
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
import { unrefTimer } from '@opentelemetry/core';
import * as metrics from '@opentelemetry/metrics';
import {
  CPU_LABELS,
  HEAP_LABELS,
  MEMORY_LABELS,
  METRIC_NAMES,
  NATIVE_SPACE_ITEM,
  NETWORK_LABELS,
  PROCESS_LABELS,
  NATIVE_STATS_ITEM,
  NATIVE_STATS_ITEM_COUNTER,
  MEMORY_LABELS_RUNTIME,
} from './enum';
import {
  getCpuUsageData,
  getHeapData,
  getMemoryData,
  getProcessData,
} from './stats/common';
import { getStats } from './stats/native';
import { getNetworkData } from './stats/si';
import { CpuUsageData } from './types';
import * as types from './types';

/**
 * Metrics Collector Configuration
 */
interface MetricsCollectorConfig {
  exporter: metrics.MetricExporter;
  // Character to be used to join metrics - default is "."
  metricNameSeparator?: string;
  // Name of component
  name: string;
  // metric export endpoint
  url: string;
  // How often the metrics should be collected
  intervalCollect?: number;
  // How often the metrics should be exported
  intervalExport?: number;
}

const DEFAULT_INTERVAL_COLLECT = 30 * 1000;
const DEFAULT_INTERVAL_EXPORT = 60 * 1000;
const DEFAULT_NAME = 'opentelemetry-metrics-collector';
const DEFAULT_METRIC_NAME_SEPARATOR = '.';

// default label name to be used to store metric name
const DEFAULT_KEY = 'name';

/**
 * Metrics Collector - collects metrics for CPU, Memory, Heap, Network, Event
 * Loop, Garbage Collector, Heap Space
 * the default label name for metric name is "name"
 */
export class MetricsCollector {
  private _intervalCollect: number | undefined;
  private _intervalExport: number | undefined;
  private _exporter: metrics.MetricExporter;
  private _meter: metrics.Meter;
  private _name: string;
  private _boundCounters: { [key: string]: api.BoundCounter } = {};

  private _metricNameSeparator: string;

  constructor(config: MetricsCollectorConfig) {
    this._intervalCollect =
      typeof config.intervalCollect === 'number'
        ? config.intervalCollect
        : DEFAULT_INTERVAL_COLLECT;
    this._intervalExport =
      typeof config.intervalExport === 'number'
        ? config.intervalExport
        : DEFAULT_INTERVAL_EXPORT;
    this._exporter = config.exporter;
    this._exporter = config.exporter;
    this._name = config.name || DEFAULT_NAME;
    this._metricNameSeparator =
      config.metricNameSeparator || DEFAULT_METRIC_NAME_SEPARATOR;
    this._meter = new metrics.MeterProvider({
      interval: this._intervalExport,
      exporter: this._exporter,
    }).getMeter(this._name);
  }

  private _boundKey(metricName: string, key: string) {
    if (!key) {
      return metricName;
    }
    return `${metricName}${this._metricNameSeparator}${key}`;
  }

  private _collectData(initial = false) {
    // CPU
    const cpuUsage: CpuUsageData = getCpuUsageData();
    Object.values(CPU_LABELS).forEach(value => {
      this._counterUpdate(METRIC_NAMES.CPU, value, cpuUsage[value]);
    });

    // NETWORK
    getNetworkData().then(networkData => {
      Object.values(NETWORK_LABELS).forEach(value => {
        this._counterUpdate(METRIC_NAMES.NETWORK, value, networkData[value]);
      });
    });

    // EVENT LOOP COUNTERS
    const stats = getStats();
    if (stats) {
      Object.values(NATIVE_STATS_ITEM_COUNTER).forEach(value => {
        this._counterUpdate(
          METRIC_NAMES.EVENT_LOOP_DELAY_COUNTER,
          value,
          stats.eventLoop[value]
        );
      });
    }
  }

  private _counterUpdate(metricName: string, key: string, value: number = 0) {
    const boundKey = this._boundKey(metricName, key);
    this._boundCounters[boundKey].add(value);
  }

  /**
   * @param metricName metric name - this will be added as label under name
   *     "name"
   * @param values values to be used to generate bound counters for each
   * value prefixed with metricName
   * @param description metric description
   * @private
   */
  private _createCounter(
    metricName: string,
    values: string[],
    description?: string
  ) {
    const keys = values.map(key => this._boundKey(metricName, key));
    const counter = this._meter.createCounter(metricName, {
      monotonic: true,
      labelKeys: [DEFAULT_KEY],
      description: description || metricName,
    });
    keys.forEach(key => {
      this._boundCounters[key] = counter.bind({ [DEFAULT_KEY]: key });
    });
  }

  /**
   * @param metricName metric name - this will be added as label under name
   *     "name"
   * @param values values to be used to generate full metric name
   * (metricName + value)
   * value prefixed with metricName
   * @param callback observer callback to be used to read the value
   * @param description metric description
   * @param labelKey extra label to be observed
   * @param labelValues label values to be observed based on labelKey
   * @param afterKey extra name to be added to full metric name
   * @private
   */
  private _createObserver(
    metricName: string,
    values: string[],
    callback: (value: string, key?: string) => number | undefined,
    description: string,
    labelKey: string = '',
    labelValues: string[] = [],
    afterKey: string = ''
  ) {
    const labelKeys = [DEFAULT_KEY];
    if (labelKey) {
      labelKeys.push(labelKey);
    }
    const observer = this._meter.createObserver(metricName, {
      monotonic: false,
      labelKeys: labelKeys,
      description: description || metricName,
    }) as metrics.ObserverMetric;

    observer.setCallback(observerResult => {
      values.forEach(value => {
        const boundKey = this._boundKey(
          this._boundKey(metricName, value),
          afterKey
        );
        if (labelKey) {
          // there is extra label to be observed mixed with default one
          // for example we want to be able to observe "name" and "gc_type"
          labelValues.forEach(label => {
            const observedLabels = Object.assign(
              {},
              { [DEFAULT_KEY]: boundKey },
              {
                [labelKey]: label,
              }
            );
            observerResult.observe(() => {
              return callback(value, label) || 0;
            }, observedLabels);
          });
        } else {
          observerResult.observe(
            () => {
              return callback(value);
            },
            { [DEFAULT_KEY]: boundKey }
          );
        }
      });
    });
  }

  private _createMetrics() {
    // CPU
    this._createCounter(
      METRIC_NAMES.CPU,
      Object.values(CPU_LABELS),
      'CPU Usage'
    );

    // NETWORK
    this._createCounter(
      METRIC_NAMES.NETWORK,
      Object.values(NETWORK_LABELS),
      'Network Usage'
    );

    // MEMORY
    this._createObserver(
      METRIC_NAMES.MEMORY,
      Object.values(MEMORY_LABELS),
      key => {
        return getMemoryData()[key as keyof types.MemoryData];
      },
      'Memory'
    );

    // MEMORY RUNTIME
    this._createObserver(
      METRIC_NAMES.MEMORY_RUNTIME,
      Object.values(MEMORY_LABELS_RUNTIME),
      key => {
        return getMemoryData()[key as keyof types.MemoryData];
      },
      'Memory'
    );

    // HEAP
    this._createObserver(
      METRIC_NAMES.HEAP,
      Object.values(HEAP_LABELS),
      key => {
        return getHeapData()[key as keyof types.HeapData];
      },
      'Heap Data'
    );

    // PROCESS
    this._createObserver(
      METRIC_NAMES.PROCESS,
      Object.values(PROCESS_LABELS),
      key => {
        return getProcessData()[key as keyof types.ProcessData];
      },
      'Process UpTime'
    );

    // EVENT LOOP
    this._createObserver(
      METRIC_NAMES.EVENT_LOOP_DELAY,
      Object.values(NATIVE_STATS_ITEM),
      key => {
        const stats = getStats();
        return stats?.eventLoop[key as keyof types.NativeStatsItem];
      },
      'Event Loop'
    );

    // EVENT LOOP COUNTERS
    this._createCounter(
      METRIC_NAMES.EVENT_LOOP_DELAY_COUNTER,
      Object.values(NATIVE_STATS_ITEM_COUNTER),
      'Event Loop'
    );

    // GC ALL
    this._createObserver(
      METRIC_NAMES.GC,
      Object.values(NATIVE_STATS_ITEM),
      key => {
        const stats = getStats();
        return stats?.gc.all[key as keyof types.NativeStatsItem];
      },
      'GC for all'
    );

    // GC BY TYPE
    this._createObserver(
      METRIC_NAMES.GC_BY_TYPE,
      Object.values(NATIVE_STATS_ITEM),
      (key, label = '') => {
        const stats = getStats();
        const stat = stats?.gc[label];
        if (stat) {
          return stat[key as keyof types.NativeStatsItem];
        }
        return undefined;
      },
      'GC by type',
      'gc_type',
      [
        'scavenge',
        'markSweepCompact',
        'incrementalMarking',
        'processWeakCallbacks',
      ]
    );

    // HEAP SPACE
    const stats = getStats();
    const spacesLabels = stats?.heap.spaces.map(space => space.spaceName);
    this._createObserver(
      METRIC_NAMES.HEAP_SPACE,
      Object.values(NATIVE_SPACE_ITEM),
      (key, label = '') => {
        if (spacesLabels === undefined) {
          return undefined;
        }
        const index = spacesLabels.indexOf(label);
        const stats = getStats();
        const stat = stats?.heap.spaces[index];
        if (stat) {
          return stat[key as keyof types.NativeStatsSpaceItemNumbers];
        }
        return undefined;
      },
      'Heap Spaces',
      'heap_space',
      spacesLabels,
      this._boundKey('by', 'space')
    );
  }

  /**
   * Starts collecting stats
   */
  start() {
    // initial collection
    getCpuUsageData();
    getMemoryData();
    getHeapData();
    getProcessData();
    getNetworkData();
    getStats();

    this._createMetrics();
    const timer = setInterval(() => {
      this._collectData();
    }, this._intervalCollect);
    unrefTimer((timer as unknown) as NodeJS.Timeout);
  }
}
