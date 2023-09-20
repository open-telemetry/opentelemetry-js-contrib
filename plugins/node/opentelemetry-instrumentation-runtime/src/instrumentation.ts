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
  private _lastIntervalELU: EventLoopUtilization;

  constructor(
    config: RuntimeInstrumentationConfig = {
      monitorEventLoopDelayResolution: 10,
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
    this.enable();
  }

  protected override _updateMetricInstruments() {
    const eventLoopDelayGauge = this.meter.createObservableGauge(
      AttributeNames.NODE_EVENT_LOOP_DELAY,
      {
        description: 'Delay of event loop.',
        unit: 'ms',
      }
    );

    const eventLoopDelayMinGauge = this.meter.createObservableGauge(
      AttributeNames.NODE_EVENT_LOOP_DELAY_MIN,
      {
        description: 'The minimum recorded event loop delay.',
        unit: 'ms',
      }
    );

    const eventLoopDelayMaxGauge = this.meter.createObservableGauge(
      AttributeNames.NODE_EVENT_LOOP_DELAY_MAX,
      {
        description: 'The maximum recorded event loop delay.',
        unit: 'ms',
      }
    );

    const eventLoopDelayMeanGauge = this.meter.createObservableGauge(
      AttributeNames.NODE_EVENT_LOOP_DELAY_MEAN,
      {
        description: 'The mean of the recorded event loop delays.',
        unit: 'ms',
      }
    );

    const eventLoopDelayStddevGauge = this.meter.createObservableGauge(
      AttributeNames.NODE_EVENT_LOOP_DELAY_STDDEV,
      {
        description:
          'The standard deviation of the recorded event loop delays.',
        unit: 'ms',
      }
    );

    const eventLoopDelayP50Gauge = this.meter.createObservableGauge(
      AttributeNames.NODE_EVENT_LOOP_DELAY_P50,
      {
        description: 'The 50th percentile of the recorded event loop delays.',
        unit: 'ms',
      }
    );

    const eventLoopDelayP95Gauge = this.meter.createObservableGauge(
      AttributeNames.NODE_EVENT_LOOP_DELAY_P95,
      {
        description: 'The 95th percentile of the recorded event loop delays.',
        unit: 'ms',
      }
    );

    const eventLoopDelayP99Gauge = this.meter.createObservableGauge(
      AttributeNames.NODE_EVENT_LOOP_DELAY_P99,
      {
        description: 'The 99th percentile of the recorded event loop delays.',
        unit: 'ms',
      }
    );

    // Event Loop Delay metrics
    this.meter.addBatchObservableCallback(
      async observable => {
        const startTime = hrTime();
        // Waits for all existing and chained promises to be resolved:
        await new Promise(setImmediate);
        const endTime = hrTime();

        // Calculate the delta between scheduling a promise and the event loop handling it.
        // This is the delay of the event loop.
        const duration = hrTimeToMilliseconds(
          hrTimeDuration(startTime, endTime)
        );
        observable.observe(eventLoopDelayGauge, duration);

        observable.observe(
          eventLoopDelayMinGauge,
          this.eventLoopDelayHistogram.min / 1e6
        );
        observable.observe(
          eventLoopDelayMaxGauge,
          this.eventLoopDelayHistogram.max / 1e6
        );

        observable.observe(
          eventLoopDelayMeanGauge,
          this.eventLoopDelayHistogram.mean / 1e6
        );

        observable.observe(
          eventLoopDelayStddevGauge,
          this.eventLoopDelayHistogram.stddev / 1e6
        );

        observable.observe(
          eventLoopDelayP50Gauge,
          this.eventLoopDelayHistogram.percentile(50) / 1e6
        );

        observable.observe(
          eventLoopDelayP95Gauge,
          this.eventLoopDelayHistogram.percentile(95) / 1e6
        );

        observable.observe(
          eventLoopDelayP99Gauge,
          this.eventLoopDelayHistogram.percentile(99) / 1e6
        );
      },
      [
        eventLoopDelayGauge,
        eventLoopDelayMinGauge,
        eventLoopDelayMaxGauge,
        eventLoopDelayMeanGauge,
        eventLoopDelayStddevGauge,
        eventLoopDelayP50Gauge,
        eventLoopDelayP95Gauge,
        eventLoopDelayP99Gauge,
      ]
    );

    const loopUtilizationGauge = this.meter.createObservableGauge(
      AttributeNames.NODE_EVENT_LOOP_UTILIZATION,
      {
        description: 'The percentage utilization of the event loop.',
        unit: 'percent',
      }
    );

    const loopIdleGauge = this.meter.createObservableGauge(
      AttributeNames.NODE_EVENT_LOOP_UTILIZATION_IDLE,
      {
        description: 'The idle time utilization of event loop.',
        unit: 'ms',
      }
    );

    const loopActiveGauge = this.meter.createObservableGauge(
      AttributeNames.NODE_EVENT_LOOP_UTILIZATION_ACTIVE,
      {
        description: 'The active time utilization of event loop.',
        unit: 'ms',
      }
    );

    // Event Loop Utilization metrics
    this.meter.addBatchObservableCallback(
      async observable => {
        // Store the current ELU so it can be assigned later.
        const currentIntervalELU = performance.eventLoopUtilization();
        // Calculate the diff between the current and last before sending.
        const ELU = performance.eventLoopUtilization(
          currentIntervalELU,
          this._lastIntervalELU
        );
        observable.observe(loopUtilizationGauge, ELU.utilization * 100);
        observable.observe(loopIdleGauge, ELU.idle);
        observable.observe(loopActiveGauge, ELU.active);
        // Assign over the last value to report the next interval.
        this._lastIntervalELU = currentIntervalELU;
      },
      [loopUtilizationGauge, loopIdleGauge, loopActiveGauge]
    );
  }

  init() {
    // No instrumentation, only metrics
  }
}
