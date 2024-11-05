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
import { RuntimeNodeInstrumentationConfig } from '../types';
import { Meter } from '@opentelemetry/api';
import { BaseCollector } from './baseCollector';

const { eventLoopUtilization: eventLoopUtilizationCollector } = performance;

export const ATTR_NODEJS_EVENT_LOOP_UTILIZATION = 'eventloop.utilization';

export class EventLoopUtilizationCollector extends BaseCollector {
  private _lastValue?: EventLoopUtilization;

  constructor(
    config: RuntimeNodeInstrumentationConfig = {},
    namePrefix: string
  ) {
    super(config, namePrefix);
  }

  public updateMetricInstruments(meter: Meter): void {
    meter
      .createObservableGauge(
        `${this.namePrefix}.${ATTR_NODEJS_EVENT_LOOP_UTILIZATION}`,
        {
          description: 'Event loop utilization',
          unit: 's',
        }
      )
      .addCallback(async observableResult => {
        if (!this._config.enabled) return;

        const elu = eventLoopUtilizationCollector(this._lastValue);
        observableResult.observe(elu.utilization);
        this._lastValue = elu;
      });
  }

  protected internalDisable(): void {}

  protected internalEnable(): void {}
}
