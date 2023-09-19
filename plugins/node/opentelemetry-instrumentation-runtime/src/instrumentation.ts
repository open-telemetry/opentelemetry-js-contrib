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

import { InstrumentationBase } from '@opentelemetry/instrumentation';
import { RuntimeInstrumentationConfig } from './types';
import { VERSION } from './version';
import {
  EventLoopUtilization,
  IntervalHistogram,
  monitorEventLoopDelay,
  performance,
} from 'perf_hooks';
import {
  hrTime,
  hrTimeDuration,
  hrTimeToMilliseconds,
} from '@opentelemetry/core';
import { AttributeNames } from './enums/AttributeNames';

/**
 * Runtime instrumentation for Opentelemetry
 */
export class RuntimeInstrumentation extends InstrumentationBase {
  private eventLoopDelayHistogram: IntervalHistogram;
  private ELU: EventLoopUtilization;
  private _lastIntervalELU: EventLoopUtilization;
  private config: RuntimeInstrumentationConfig;
  private interval: NodeJS.Timeout | undefined;

  constructor(
    config: RuntimeInstrumentationConfig = {
      monitorEventLoopDelayResolution: 10,
      monitorEventLoopUtilizationResolution: 30000,
    }
  ) {
    super('@opentelemetry/instrumentation-runtime', VERSION, config);

    // https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions
    this.eventLoopDelayHistogram = monitorEventLoopDelay({
      resolution: config.monitorEventLoopDelayResolution,
    });
    this.eventLoopDelayHistogram.enable();

    // https://nodejs.org/api/perf_hooks.html#performanceeventlooputilizationutilization1-utilization2
    const initialELU = performance.eventLoopUtilization();
    this._lastIntervalELU = initialELU;
    this.ELU = initialELU;
    this.config = config;
    this.enable();
  }

  protected override _updateMetricInstruments() {
    this.meter
      .createObservableGauge(AttributeNames.NODE_EVENT_LOOP_DELAY, {
        description: 'Lag of event loop.',
        unit: 'ms',
      })
      .addCallback(async observable => {
        const startTime = hrTime();
        await new Promise<void>(resolve => setImmediate(() => resolve()));
        const duration = hrTimeToMilliseconds(
          hrTimeDuration(startTime, hrTime())
        );
        observable.observe(duration);
      });

    this.meter
      .createObservableGauge(AttributeNames.NODE_EVENT_LOOP_DELAY_MIN, {
        description: 'The minimum recorded event loop delay.',
        unit: 'ms',
      })
      .addCallback(observable => {
        observable.observe(this.eventLoopDelayHistogram.min / 1e6);
      });

    this.meter
      .createObservableGauge(AttributeNames.NODE_EVENT_LOOP_DELAY_MAX, {
        description: 'The maximum recorded event loop delay.',
        unit: 'ms',
      })
      .addCallback(observable => {
        observable.observe(this.eventLoopDelayHistogram.max / 1e6);
      });

    this.meter
      .createObservableGauge(AttributeNames.NODE_EVENT_LOOP_DELAY_MEAN, {
        description: 'The mean of the recorded event loop delays.',
        unit: 'ms',
      })
      .addCallback(observable => {
        observable.observe(this.eventLoopDelayHistogram.mean / 1e6);
      });

    this.meter
      .createObservableGauge(AttributeNames.NODE_EVENT_LOOP_DELAY_STDDEV, {
        description:
          'The standard deviation of the recorded event loop delays.',
        unit: 'ms',
      })
      .addCallback(observable => {
        observable.observe(this.eventLoopDelayHistogram.stddev / 1e6);
      });

    this.meter
      .createObservableGauge(AttributeNames.NODE_EVENT_LOOP_DELAY_P50, {
        description: 'The 50th percentile of the recorded event loop delays.',
        unit: 'ms',
      })
      .addCallback(observable => {
        observable.observe(this.eventLoopDelayHistogram.percentile(50) / 1e6);
      });

    this.meter
      .createObservableGauge(AttributeNames.NODE_EVENT_LOOP_DELAY_P95, {
        description: 'The 95th percentile of the recorded event loop delays.',
        unit: 'ms',
      })
      .addCallback(observable => {
        observable.observe(this.eventLoopDelayHistogram.percentile(95) / 1e6);
      });

    this.meter
      .createObservableGauge(AttributeNames.NODE_EVENT_LOOP_DELAY_P99, {
        description: 'The 99th percentile of the recorded event loop delays.',
        unit: 'ms',
      })
      .addCallback(observable => {
        observable.observe(this.eventLoopDelayHistogram.percentile(99) / 1e6);
      });

    this.meter
      .createObservableGauge(AttributeNames.NODE_EVENT_LOOP_UTILIZATION, {
        description: 'The percentage utilization of the event loop.',
        unit: 'percent',
      })
      .addCallback(async observable => {
        observable.observe(this.ELU.utilization * 100);
      });

    this.meter
      .createObservableGauge(AttributeNames.NODE_EVENT_LOOP_UTILIZATION_IDLE, {
        description: 'The idle time utilization of event loop.',
        unit: 'ms',
      })
      .addCallback(async observable => {
        observable.observe(this.ELU.idle);
      });

    this.meter
      .createObservableGauge(
        AttributeNames.NODE_EVENT_LOOP_UTILIZATION_ACTIVE,
        {
          description: 'The active time utilization of event loop.',
          unit: 'ms',
        }
      )
      .addCallback(async observable => {
        observable.observe(this.ELU.active);
      });
  }

  override enable() {
    if (!this.interval && this.config) {
      this._diag.debug(
        'Starting interval for measuring event loop utilization.'
      );
      this.interval = setInterval(() => {
        // Store the current ELU so it can be assigned later.
        const currentIntervalELU = performance.eventLoopUtilization();
        // Calculate the diff between the current and last before sending.
        this.ELU = performance.eventLoopUtilization(
          currentIntervalELU,
          this._lastIntervalELU
        );
        // Assign over the last value to report the next interval.
        this._lastIntervalELU = currentIntervalELU;
      }, this.config.monitorEventLoopUtilizationResolution);
    }
  }

  override disable() {
    if (this.interval) {
      this._diag.debug(
        'Removing interval for measuring event loop utilization.'
      );
      clearInterval(this.interval);
    }
  }

  init() {
    // No instrumentation, only metrics
  }
}
