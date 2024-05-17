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
import * as metrics from '@opentelemetry/sdk-metrics';

import { VERSION } from './version';

/**
 * Metrics Collector Configuration
 */
export interface MetricsCollectorConfig {
  // Meter Provider
  meterProvider?: metrics.MeterProvider;
  // Character to be used to join metrics - default is "."
  metricNameSeparator?: string;
  // Name of component
  name: string;
  // metric export endpoint
  url?: string;
}

const DEFAULT_NAME = '@opentelemetry/host-metrics';

/**
 * Base Class for metrics
 */
export abstract class BaseMetrics {
  protected _logger = api.diag;
  protected _meter: api.Meter;
  private _name: string;

  constructor(config: MetricsCollectorConfig) {
    this._name = config.name || DEFAULT_NAME;
    const meterProvider =
      config.meterProvider || api.metrics.getMeterProvider();
    if (!config.meterProvider) {
      this._logger.warn('No meter provider, using default');
    }
    this._meter = meterProvider.getMeter(this._name, VERSION);
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
