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
import * as metrics from '@opentelemetry/metrics';
import * as enums from './enum';

import { getCpuUsageData, getMemoryData } from './stats/common';
import { getNetworkData } from './stats/si';

import * as types from './types';

/**
 * Metrics Collector Configuration
 */
export interface MetricsCollectorConfig {
  logger?: api.Logger;
  exporter: metrics.MetricExporter;
  // maximum timeout to wait for stats collection default is 500ms
  maxTimeoutUpdateMS?: number;
  // Character to be used to join metrics - default is "."
  metricNameSeparator?: string;
  // Name of component
  name: string;
  // metric export endpoint
  url: string;
  // How often the metrics should be exported
  interval?: number;
}

const DEFAULT_INTERVAL = 60 * 1000;
const DEFAULT_MAX_TIMEOUT_UPDATE_MS = 500;
const DEFAULT_NAME = 'opentelemetry-metrics-collector';
const DEFAULT_METRIC_NAME_SEPARATOR = '.';

// default label name to be used to store metric name
const DEFAULT_KEY = 'name';

/**
 * Metrics Collector - collects metrics for CPU, Memory, Heap, Network, Event
 * Loop, Garbage Collector, Heap Space
 * the default label name for metric name is "name"
 */
export class RCAMetrics {
  private _intervalExport: number | undefined;
  private _exporter: metrics.MetricExporter;
  protected _logger: api.Logger | undefined;
  protected _maxTimeoutUpdateMS: number;
  protected _meter: metrics.Meter;
  private _name: string;
  private _boundCounters: { [key: string]: api.BoundCounter } = {};
  private _metricNameSeparator: string;

  private _memValueObserver: types.ValueObserverWithObservations | undefined;

  constructor(config: MetricsCollectorConfig) {
    this._intervalExport =
      typeof config.interval === 'number' ? config.interval : DEFAULT_INTERVAL;
    this._exporter = config.exporter;
    this._logger = config.logger;
    this._name = config.name || DEFAULT_NAME;
    this._maxTimeoutUpdateMS =
      config.maxTimeoutUpdateMS || DEFAULT_MAX_TIMEOUT_UPDATE_MS;
    this._metricNameSeparator =
      config.metricNameSeparator || DEFAULT_METRIC_NAME_SEPARATOR;
    this._meter = new metrics.MeterProvider({
      interval: this._intervalExport,
      exporter: this._exporter,
    }).getMeter(this._name);
  }

  /**
   * Creates a metric key name based on metric name and a key
   * @param metricName
   * @param key
   */
  protected _boundKey(metricName: string, key: string) {
    if (!key) {
      return metricName;
    }
    return `${metricName}${this._metricNameSeparator}${key}`;
  }

  /**
   * Updates counter based on boundkey
   * @param metricName
   * @param key
   * @param value
   */
  protected _counterUpdate(metricName: string, key: string, value = 0) {
    const boundKey = this._boundKey(metricName, key);
    this._boundCounters[boundKey].add(value);
  }

  /**
   * @param metricName metric name - this will be added as label under name
   *     "name"
   * @param values values to be used to generate bound counters for each
   * value prefixed with metricName
   * @param description metric description
   */
  protected _createCounter(
    metricName: string,
    values: string[],
    description?: string
  ) {
    const keys = values.map(key => this._boundKey(metricName, key));
    const counter = this._meter.createCounter(metricName, {
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
   * @param description metric description
   * @param labelKey extra label to be observed
   * @param labelValues label values to be observed based on labelKey
   * @param afterKey extra name to be added to full metric name
   */
  protected _createValueObserver(
    metricName: string,
    values: string[],
    description: string,
    labelKey = '',
    labelValues: string[] = [],
    afterKey = ''
  ): types.ValueObserverWithObservations {
    const labelKeys = [DEFAULT_KEY];
    if (labelKey) {
      labelKeys.push(labelKey);
    }
    const observer = this._meter.createValueObserver(metricName, {
      description: description || metricName,
    });

    const observations: types.Observations[] = [];
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
          observations.push({
            key: value,
            labels: observedLabels,
            labelKey,
          });
        });
      } else {
        observations.push({
          key: value,
          labels: { [DEFAULT_KEY]: boundKey },
        });
      }
    });

    return { observer, observations };
  }

  // MEMORY
  private _createMemValueObserver() {
    this._memValueObserver = this._createValueObserver(
      enums.METRIC_NAMES.MEMORY,
      Object.values(enums.MEMORY_LABELS),
      'Memory'
    );
  }

  /**
   * Updates observer
   * @param observerBatchResult
   * @param data
   * @param observerWithObservations
   */
  protected _updateObserver<DataType>(
    observerBatchResult: api.BatchObserverResult,
    data: DataType,
    observerWithObservations?: types.ValueObserverWithObservations
  ) {
    if (observerWithObservations) {
      observerWithObservations.observations.forEach(observation => {
        const value = data[observation.key as keyof DataType];
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
