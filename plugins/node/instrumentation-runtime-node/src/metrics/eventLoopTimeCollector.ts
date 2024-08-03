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

export const NODEJS_EVENT_LOOP_TIME = 'eventloop.time';

export class EventLoopTimeCollector extends BaseCollector {
  constructor(
    config: RuntimeNodeInstrumentationConfig = {},
    namePrefix: string
  ) {
    super(config, namePrefix);
  }

  public updateMetricInstruments(meter: Meter): void {
    const timeCounter = meter.createObservableCounter(
      `${this.namePrefix}.${NODEJS_EVENT_LOOP_TIME}`,
      {
        description:
          'Cumulative duration of time the event loop has been in each state.',
        unit: 's',
      }
    );

    meter.addBatchObservableCallback(
      async observableResult => {
        if (!this._config.enabled) return;

        const data = this.scrape();
        if (data === undefined) return;

        observableResult.observe(timeCounter, data.active / 1000, {
          [`${this.namePrefix}.eventloop.state`]: 'active',
        });
        observableResult.observe(timeCounter, data.idle / 1000, {
          [`${this.namePrefix}.eventloop.state`]: 'idle',
        });
      },
      [timeCounter]
    );
  }

  protected internalDisable(): void {}

  protected internalEnable(): void {}

  private scrape(): EventLoopUtilization {
    return eventLoopUtilizationCollector();
  }
}
