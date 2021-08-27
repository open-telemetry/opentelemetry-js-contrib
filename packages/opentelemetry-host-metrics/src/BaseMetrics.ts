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
import * as apiMetrics from '@opentelemetry/api-metrics';
import * as metrics from '@opentelemetry/sdk-metrics-base';

import { VERSION } from './version';

/**
 * Metrics Collector Configuration
 */
export interface MetricsCollectorConfig {
  // maximum timeout to wait for stats collection default is 500ms
  maxTimeoutUpdateMS?: number;
  // Meter Provider
  meterProvider?: metrics.MeterProvider;
  // Character to be used to join metrics - default is "."
  metricNameSeparator?: string;
  // Name of component
  name: string;
  // metric export endpoint
  url?: string;
}

const DEFAULT_MAX_TIMEOUT_UPDATE_MS = 500;
const DEFAULT_NAME = 'opentelemetry-host-metrics';
const DEFAULT_METRIC_NAME_SEPARATOR = '.';

// default label name to be used to store metric name
const DEFAULT_KEY = 'name';

/**
 * Base Class for metrics
 */
export abstract class BaseMetrics {
  protected _logger = api.diag;
  protected _maxTimeoutUpdateMS: number;
  protected _meter: metrics.Meter;
  private _name: string;
  private _boundCounters: { [key: string]: apiMetrics.BoundCounter } = {};
  private _metricNameSeparator: string;

  constructor(config: MetricsCollectorConfig) {
    this._name = config.name || DEFAULT_NAME;
    this._maxTimeoutUpdateMS =
      config.maxTimeoutUpdateMS || DEFAULT_MAX_TIMEOUT_UPDATE_MS;
    this._metricNameSeparator =
      config.metricNameSeparator || DEFAULT_METRIC_NAME_SEPARATOR;
    const meterProvider =
      config.meterProvider! || apiMetrics.metrics.getMeterProvider();
    if (!config.meterProvider) {
      this._logger.warn('No meter provider, using default');
    }
    this._meter = meterProvider.getMeter(this._name, VERSION);
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
   * Creates metrics
   */
  protected abstract _createMetrics(): void;

  /**
   * Starts collecting stats
   */
  public abstract start(): void;
}
