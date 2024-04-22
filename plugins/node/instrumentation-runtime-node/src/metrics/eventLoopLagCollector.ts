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
import { RuntimeNodeInstrumentationConfig } from '../types';
import { Meter } from '@opentelemetry/api';
import { IntervalHistogram } from 'node:perf_hooks';
import { BaseCollector } from './baseCollector';
import * as perf_hooks from 'node:perf_hooks';

const NODEJS_EVENTLOOP_LAG = 'event_loop.lag_seconds';
const NODEJS_EVENTLOOP_LAG_MIN = 'event_loop.lag_min_seconds';
const NODEJS_EVENTLOOP_LAG_MAX = 'event_loop.lag_max_seconds';
const NODEJS_EVENTLOOP_LAG_MEAN = 'event_loop.lag_mean_seconds';
const NODEJS_EVENTLOOP_LAG_STDDEV = 'event_loop.lag_stddev_seconds';
const NODEJS_EVENTLOOP_LAG_P50 = 'event_loop.lag_p50_seconds';
const NODEJS_EVENTLOOP_LAG_P90 = 'event_loop.lag_p90_seconds';
const NODEJS_EVENTLOOP_LAG_P99 = 'event_loop.lag_p99_seconds';

export const metricNames = [
  { name: NODEJS_EVENTLOOP_LAG, description: 'Lag of event loop in seconds.' },
  {
    name: NODEJS_EVENTLOOP_LAG_MIN,
    description: 'The minimum recorded event loop delay.',
  },
  {
    name: NODEJS_EVENTLOOP_LAG_MAX,
    description: 'The maximum recorded event loop delay.',
  },
  {
    name: NODEJS_EVENTLOOP_LAG_MEAN,
    description: 'The mean of the recorded event loop delays.',
  },
  {
    name: NODEJS_EVENTLOOP_LAG_STDDEV,
    description: 'The standard deviation of the recorded event loop delays.',
  },
  {
    name: NODEJS_EVENTLOOP_LAG_P50,
    description: 'The 50th percentile of the recorded event loop delays.',
  },
  {
    name: NODEJS_EVENTLOOP_LAG_P90,
    description: 'The 90th percentile of the recorded event loop delays.',
  },
  {
    name: NODEJS_EVENTLOOP_LAG_P99,
    description: 'The 99th percentile of the recorded event loop delays.',
  },
];

export interface EventLoopLagInformation {
  min: number;
  max: number;
  mean: number;
  stddev: number;
  p50: number;
  p90: number;
  p99: number;
}

export class EventLoopLagCollector extends BaseCollector<EventLoopLagInformation> {
  private _histogram: IntervalHistogram;

  constructor(
    config: RuntimeNodeInstrumentationConfig = {},
    namePrefix: string
  ) {
    super(config, namePrefix);
    this._histogram = perf_hooks.monitorEventLoopDelay({
      resolution: config.monitoringPrecision,
    });
  }

  updateMetricInstruments(meter: Meter): void {
    const lag = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[0].name}`,
      {
        description: metricNames[0].description,
        unit: '1',
      }
    );
    const lagMin = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[1].name}`,
      {
        description: metricNames[1].description,
        unit: '1',
      }
    );
    const lagMax = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[2].name}`,
      {
        description: metricNames[2].description,
        unit: '1',
      }
    );
    const lagMean = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[3].name}`,
      {
        description: metricNames[3].description,
        unit: '1',
      }
    );
    const lagStddev = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[4].name}`,
      {
        description: metricNames[4].description,
        unit: '1',
      }
    );
    const lagp50 = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[5].name}`,
      {
        description: metricNames[5].description,
        unit: '1',
      }
    );
    const lagp90 = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[6].name}`,
      {
        description: metricNames[6].description,
        unit: '1',
      }
    );
    const lagp99 = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[7].name}`,
      {
        description: metricNames[7].description,
        unit: '1',
      }
    );

    meter.addBatchObservableCallback(
      async observableResult => {
        if (this._scrapeQueue.length === 0) return;

        const data = this._scrapeQueue.shift();
        if (data === undefined) return;

        const start = process.hrtime();
        const lagResult = await new Promise<number>(res => {
          setImmediate((start: [number, number]) => {
            res(this._reportEventloopLag(start));
          }, start);
        });

        observableResult.observe(lag, lagResult);
        observableResult.observe(lagMin, data.min);
        observableResult.observe(lagMax, data.max);
        observableResult.observe(lagMean, data.mean);
        observableResult.observe(lagStddev, data.stddev);
        observableResult.observe(lagp50, data.p50);
        observableResult.observe(lagp90, data.p90);
        observableResult.observe(lagp99, data.p99);

        this._histogram.reset();
      },
      [lag, lagMin, lagMax, lagMean, lagStddev, lagp50, lagp90, lagp99]
    );
  }

  internalEnable(): void {
    this._histogram.enable();
  }

  internalDisable(): void {
    this._histogram.disable();
  }

  protected scrape(): EventLoopLagInformation {
    return {
      min: this.checkNan(this._histogram.min / 1e9),
      max: this.checkNan(this._histogram.max / 1e9),
      mean: this.checkNan(this._histogram.mean / 1e9),
      stddev: this.checkNan(this._histogram.stddev / 1e9),
      p50: this.checkNan(this._histogram.percentile(90) / 1e9),
      p90: this.checkNan(this._histogram.percentile(90) / 1e9),
      p99: this.checkNan(this._histogram.percentile(99) / 1e9),
    };
  }

  private _reportEventloopLag(start: [number, number]): number {
    const delta = process.hrtime(start);
    const nanosec = delta[0] * 1e9 + delta[1];
    const seconds = nanosec / 1e9;
    return seconds;
  }

  private checkNan(value: number) {
    return isNaN(value) ? 0 : value;
  }
}
