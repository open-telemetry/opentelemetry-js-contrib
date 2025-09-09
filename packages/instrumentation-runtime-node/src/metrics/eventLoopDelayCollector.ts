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
import * as perf_hooks from 'node:perf_hooks';
import { IntervalHistogram } from 'node:perf_hooks';
import { BaseCollector } from './baseCollector';

enum NodeJsEventLoopDelayAttributes {
  min = 'eventloop.delay.min',
  max = 'eventloop.delay.max',
  mean = 'eventloop.delay.mean',
  stddev = 'eventloop.delay.stddev',
  p50 = 'eventloop.delay.p50',
  p90 = 'eventloop.delay.p90',
  p99 = 'eventloop.delay.p99',
}

export const metricNames: Record<
  NodeJsEventLoopDelayAttributes,
  { description: string }
> = {
  [NodeJsEventLoopDelayAttributes.min]: {
    description: 'Event loop minimum delay.',
  },
  [NodeJsEventLoopDelayAttributes.max]: {
    description: 'Event loop maximum delay.',
  },
  [NodeJsEventLoopDelayAttributes.mean]: {
    description: 'Event loop mean delay.',
  },
  [NodeJsEventLoopDelayAttributes.stddev]: {
    description: 'Event loop standard deviation delay.',
  },
  [NodeJsEventLoopDelayAttributes.p50]: {
    description: 'Event loop 50 percentile delay.',
  },
  [NodeJsEventLoopDelayAttributes.p90]: {
    description: 'Event loop 90 percentile delay.',
  },
  [NodeJsEventLoopDelayAttributes.p99]: {
    description: 'Event loop 99 percentile delay.',
  },
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
      `${this.namePrefix}.${NodeJsEventLoopDelayAttributes.min}`,
      {
        description:
          metricNames[NodeJsEventLoopDelayAttributes.min].description,
        unit: 's',
      }
    );
    const delayMax = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelayAttributes.max}`,
      {
        description:
          metricNames[NodeJsEventLoopDelayAttributes.max].description,
        unit: 's',
      }
    );
    const delayMean = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelayAttributes.mean}`,
      {
        description:
          metricNames[NodeJsEventLoopDelayAttributes.mean].description,
        unit: 's',
      }
    );
    const delayStddev = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelayAttributes.stddev}`,
      {
        description:
          metricNames[NodeJsEventLoopDelayAttributes.stddev].description,
        unit: 's',
      }
    );
    const delayp50 = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelayAttributes.p50}`,
      {
        description:
          metricNames[NodeJsEventLoopDelayAttributes.p50].description,
        unit: 's',
      }
    );
    const delayp90 = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelayAttributes.p90}`,
      {
        description:
          metricNames[NodeJsEventLoopDelayAttributes.p90].description,
        unit: 's',
      }
    );
    const delayp99 = meter.createObservableGauge(
      `${this.namePrefix}.${NodeJsEventLoopDelayAttributes.p99}`,
      {
        description:
          metricNames[NodeJsEventLoopDelayAttributes.p99].description,
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
