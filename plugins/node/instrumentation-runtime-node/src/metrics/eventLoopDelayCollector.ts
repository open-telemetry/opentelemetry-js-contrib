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
import {IntervalHistogram} from 'node:perf_hooks';
import {BaseCollector} from './baseCollector';
import * as perf_hooks from 'node:perf_hooks';

enum NodeJsEventLoopDelay {
  delay = 'eventloop.delay',
  min = 'eventloop.delay.min',
  max = 'eventloop.delay.max',
  mean = 'eventloop.delay.mean',
  stddev = 'eventloop.delay.stddev',
  p50 = 'eventloop.delay.p50',
  p90 = 'eventloop.delay.p90',
  p99 = 'eventloop.delay.p99'
}

export const metricNames: Record<NodeJsEventLoopDelay, { description: string }> = {
  [NodeJsEventLoopDelay.delay]:
    {
      description:
        'Lag of event loop in seconds.'
    },
  [NodeJsEventLoopDelay.min]:
    {
      description:
        'The minimum recorded event loop delay.',
    },
  [NodeJsEventLoopDelay.max]:
    {
      description:
        'The maximum recorded event loop delay.',
    }
  ,
  [NodeJsEventLoopDelay.mean]:
    {
      description:
        'The mean of the recorded event loop delays.',
    }
  ,
  [NodeJsEventLoopDelay.stddev]:
    {
      description:
        'The standard deviation of the recorded event loop delays.',
    }
  ,
  [NodeJsEventLoopDelay.p50]:
    {
      description:
        'The 50th percentile of the recorded event loop delays.',
    }
  ,
  [NodeJsEventLoopDelay.p90]:
    {
      description:
        'The 90th percentile of the recorded event loop delays.',
    }
  ,
  [NodeJsEventLoopDelay.p99]:
    {

      description:
        'The 99th percentile of the recorded event loop delays.',
    }
  ,
};

export interface EventLoopLagInformation {
  min: number;
  max: number;
  mean: number;
  stddev: number;
  p50: number;
  p90: number;
  p99: number;
}

export class EventLoopDelayCollector extends BaseCollector<EventLoopLagInformation> {
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
    const delay = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelay.delay}`,
      {
        description: metricNames[NodeJsEventLoopDelay.delay].description,
        unit: 's',
      }
    );
    const delayMin = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelay.min}`,
      {
        description: metricNames[NodeJsEventLoopDelay.min].description,
        unit: 's',
      }
    );
    const delayMax = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelay.max}`,
      {
        description: metricNames[NodeJsEventLoopDelay.max].description,
        unit: 's',
      }
    );
    const delayMean = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelay.mean}`,
      {
        description: metricNames[NodeJsEventLoopDelay.mean].description,
        unit: 's',
      }
    );
    const delayStddev = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelay.stddev}`,
      {
        description: metricNames[NodeJsEventLoopDelay.stddev].description,
        unit: 's',
      }
    );
    const delayp50 = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelay.p50}`,
      {
        description: metricNames[NodeJsEventLoopDelay.p50].description,
        unit: 's',
      }
    );
    const delayp90 = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelay.p90}`,
      {
        description: metricNames[NodeJsEventLoopDelay.p90].description,
        unit: 's',
      }
    );
    const delayp99 = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelay.p99}`,
      {
        description: metricNames[NodeJsEventLoopDelay.p99].description,
        unit: 's',
      }
    );

    meter.addBatchObservableCallback(
      async observableResult => {
        if (this._scrapeQueue.length === 0) return;

        const data = this._scrapeQueue.shift();
        if (data === undefined) return;

        const start = process.hrtime();
        const delayResult = await new Promise<number>(res => {
          setImmediate((start: [number, number]) => {
            res(this._reportEventloopLag(start));
          }, start);
        });

        observableResult.observe(delay, delayResult, this.versionAttribute);
        observableResult.observe(delayMin, data.min, this.versionAttribute);
        observableResult.observe(delayMax, data.max, this.versionAttribute);
        observableResult.observe(delayMean, data.mean, this.versionAttribute);
        observableResult.observe(delayStddev, data.stddev, this.versionAttribute);
        observableResult.observe(delayp50, data.p50, this.versionAttribute);
        observableResult.observe(delayp90, data.p90, this.versionAttribute);
        observableResult.observe(delayp99, data.p99, this.versionAttribute);

        this._histogram.reset();
      },
      [delay, delayMin, delayMax, delayMean, delayStddev, delayp50, delayp90, delayp99]
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
