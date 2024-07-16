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

enum NodeJsEventLoopDelay {
  min = 'eventloop.delay.min',
  max = 'eventloop.delay.max',
  mean = 'eventloop.delay.mean',
  stddev = 'eventloop.delay.stddev',
  p50 = 'eventloop.delay.p50',
  p90 = 'eventloop.delay.p90',
  p99 = 'eventloop.delay.p99'
}

export const metricNames: Record<
  NodeJsEventLoopDelay,
  { description: string }
> = {
  [NodeJsEventLoopDelay.min]: {
    description: 'Event loop minimum delay.',
  },
  [NodeJsEventLoopDelay.max]: {
    description: 'Event loop maximum delay.',
  },
  [NodeJsEventLoopDelay.mean]: {
    description: 'Event loop mean delay.',
  },
  [NodeJsEventLoopDelay.stddev]: {
    description: 'Event loop standard deviation delay.',
  },
  [NodeJsEventLoopDelay.p50]: {
    description: 'Event loop 50 percentile delay.',
  },
  [NodeJsEventLoopDelay.p90]: {
    description: 'Event loop 90 percentile delay.',
  },
  [NodeJsEventLoopDelay.p99]: {
    description: 'Event loop 99 percentile delay.',
  }
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

export class EventLoopDelayCollector extends BaseCollector {
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
        if(!this._config.enabled) return

        const data = this.scrape();
        if (data === undefined) return;

        observableResult.observe(delayMin, data.min);
        observableResult.observe(delayMax, data.max);
        observableResult.observe(delayMean, data.mean);
        observableResult.observe(delayStddev, data.stddev);
        observableResult.observe(delayp50, data.p50);
        observableResult.observe(delayp90, data.p90);
        observableResult.observe(delayp99, data.p99);

        this._histogram.reset();
      },
      [
        delayMin,
        delayMax,
        delayMean,
        delayStddev,
        delayp50,
        delayp90,
        delayp99,
      ]
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
