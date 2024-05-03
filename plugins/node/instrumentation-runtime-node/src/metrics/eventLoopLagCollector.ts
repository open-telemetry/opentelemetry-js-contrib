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
import {RuntimeNodeInstrumentationConfig} from '../types';
import {Meter} from '@opentelemetry/api';
import * as perf_hooks from 'node:perf_hooks';
import {IntervalHistogram} from 'node:perf_hooks';
import {BaseCollector} from './baseCollector';

const NODEJS_EVENTLOOP_LAG = 'eventloop.lag';
export const NODEJS_EVENTLOOP_LAG_ATTRIBUTE_TYPE = 'eventloop.lag.type';


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
    meter.createObservableGauge(
      `${this.namePrefix}.${NODEJS_EVENTLOOP_LAG}`,
      {
        description: "Event loop lag.",
        unit: 's'
      },
    ).addCallback(async observableResult => {
      if (this._scrapeQueue.length === 0) return;

      const data = this._scrapeQueue.shift();
      if (data === undefined) return;

      const start = process.hrtime();
      const lagResult = await new Promise<number>(res => {
        setImmediate((start: [number, number]) => {
          res(this._reportEventloopLag(start));
        }, start);
      });

      observableResult.observe(lagResult);

      for (const [value, attributeType] of Object.keys(data).entries()) {
        observableResult.observe(value, {
          [`${this.namePrefix}.${NODEJS_EVENTLOOP_LAG_ATTRIBUTE_TYPE}`]: attributeType
        });
      }

    });
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
    return nanosec / 1e9;
  }

  private checkNan(value: number) {
    return isNaN(value) ? 0 : value;
  }
}
