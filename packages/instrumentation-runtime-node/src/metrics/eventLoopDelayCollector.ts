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
import { Meter } from '@opentelemetry/api';
import * as perf_hooks from 'node:perf_hooks';
import { IntervalHistogram } from 'node:perf_hooks';
import {
  METRIC_NODEJS_EVENTLOOP_DELAY_MAX,
  METRIC_NODEJS_EVENTLOOP_DELAY_MEAN,
  METRIC_NODEJS_EVENTLOOP_DELAY_MIN,
  METRIC_NODEJS_EVENTLOOP_DELAY_P50,
  METRIC_NODEJS_EVENTLOOP_DELAY_P90,
  METRIC_NODEJS_EVENTLOOP_DELAY_P99,
  METRIC_NODEJS_EVENTLOOP_DELAY_STDDEV,
} from '../semconv';

import type { RuntimeNodeInstrumentationConfig } from '../types';
import { BaseCollector } from './baseCollector';

export interface EventLoopLagInformation {
  min: number;
  max: number;
  mean: number;
  stddev: number;
  p50: number;
  p90: number;
  p99: number;
}

export class EventLoopDelayCollector extends BaseCollector {
  private _histogram: IntervalHistogram;

  constructor(config: RuntimeNodeInstrumentationConfig = {}) {
    super(config);
    this._histogram = perf_hooks.monitorEventLoopDelay({
      resolution: config.monitoringPrecision,
    });
  }

  updateMetricInstruments(meter: Meter): void {
    const delayMin = meter.createObservableGauge(
      METRIC_NODEJS_EVENTLOOP_DELAY_MIN,
      {
        description: 'Event loop minimum delay.',
        unit: 's',
      }
    );
    const delayMax = meter.createObservableGauge(
      METRIC_NODEJS_EVENTLOOP_DELAY_MAX,
      {
        description: 'Event loop maximum delay.',
        unit: 's',
      }
    );
    const delayMean = meter.createObservableGauge(
      METRIC_NODEJS_EVENTLOOP_DELAY_MEAN,
      {
        description: 'Event loop mean delay.',
        unit: 's',
      }
    );
    const delayStddev = meter.createObservableGauge(
      METRIC_NODEJS_EVENTLOOP_DELAY_STDDEV,
      {
        description: 'Event loop standard deviation delay.',
        unit: 's',
      }
    );
    const delayp50 = meter.createObservableGauge(
      METRIC_NODEJS_EVENTLOOP_DELAY_P50,
      {
        description: 'Event loop 50 percentile delay.',
        unit: 's',
      }
    );
    const delayp90 = meter.createObservableGauge(
      METRIC_NODEJS_EVENTLOOP_DELAY_P90,
      {
        description: 'Event loop 90 percentile delay.',
        unit: 's',
      }
    );
    const delayp99 = meter.createObservableGauge(
      METRIC_NODEJS_EVENTLOOP_DELAY_P99,
      {
        description: 'Event loop 99 percentile delay.',
        unit: 's',
      }
    );

    meter.addBatchObservableCallback(
      async observableResult => {
        if (!this._config.enabled) return;

        const data = this.scrape();
        if (data === undefined) return;
        if (this._histogram.count < 5) return; // Don't return histogram data if we have less than 5 samples

        observableResult.observe(delayMin, data.min);
        observableResult.observe(delayMax, data.max);
        observableResult.observe(delayMean, data.mean);
        observableResult.observe(delayStddev, data.stddev);
        observableResult.observe(delayp50, data.p50);
        observableResult.observe(delayp90, data.p90);
        observableResult.observe(delayp99, data.p99);

        this._histogram.reset();
      },
      [delayMin, delayMax, delayMean, delayStddev, delayp50, delayp90, delayp99]
    );
  }

  internalEnable(): void {
    this._histogram.enable();
  }

  internalDisable(): void {
    this._histogram.disable();
  }

  private scrape(): EventLoopLagInformation {
    return {
      min: this.checkNan(this._histogram.min / 1e9),
      max: this.checkNan(this._histogram.max / 1e9),
      mean: this.checkNan(this._histogram.mean / 1e9),
      stddev: this.checkNan(this._histogram.stddev / 1e9),
      p50: this.checkNan(this._histogram.percentile(50) / 1e9),
      p90: this.checkNan(this._histogram.percentile(90) / 1e9),
      p99: this.checkNan(this._histogram.percentile(99) / 1e9),
    };
  }

  private checkNan(value: number) {
    return isNaN(value) ? 0 : value;
  }
}
