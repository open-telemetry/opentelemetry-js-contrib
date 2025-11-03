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

import { EventLoopUtilization, performance } from 'node:perf_hooks';
import { Meter } from '@opentelemetry/api';
import { BaseCollector } from './baseCollector';
import { METRIC_NODEJS_EVENTLOOP_UTILIZATION } from '../semconv';

const { eventLoopUtilization: eventLoopUtilizationCollector } = performance;

export class EventLoopUtilizationCollector extends BaseCollector {
  // Value needs to be initialized the first time otherwise the first measurement would always be 1
  // See https://github.com/open-telemetry/opentelemetry-js-contrib/pull/3118#issuecomment-3429737955
  private _lastValue: EventLoopUtilization = eventLoopUtilizationCollector();

  public updateMetricInstruments(meter: Meter): void {
    meter
      .createObservableGauge(METRIC_NODEJS_EVENTLOOP_UTILIZATION, {
        description: 'Event loop utilization',
        unit: '1',
      })
      .addCallback(async observableResult => {
        if (!this._config.enabled) return;

        const currentELU = eventLoopUtilizationCollector();
        const deltaELU = eventLoopUtilizationCollector(
          currentELU,
          this._lastValue
        );
        this._lastValue = currentELU;
        observableResult.observe(deltaELU.utilization);
      });
  }

  protected internalDisable(): void {}

  protected internalEnable(): void {}
}
