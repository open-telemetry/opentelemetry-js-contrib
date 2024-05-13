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
const { eventLoopUtilization } = performance;

import { InstrumentationBase } from '@opentelemetry/instrumentation';

import { NPM_PACKAGE_NAME, NPM_PACKAGE_VERSION } from './version';
import { RuntimeNodeInstrumentationConfig } from './types';

const ELUS_LENGTH = 2;
const DEFAULT_CONFIG: RuntimeNodeInstrumentationConfig = {
  eventLoopUtilizationMeasurementInterval: 5000,
};

export class RuntimeNodeInstrumentation extends InstrumentationBase {
  private _ELUs: EventLoopUtilization[] = [];
  private _interval: NodeJS.Timeout | undefined;

  constructor(config: RuntimeNodeInstrumentationConfig = {}) {
    super(
      NPM_PACKAGE_NAME,
      NPM_PACKAGE_VERSION,
      Object.assign({}, DEFAULT_CONFIG, config)
    );
  }

  private _addELU() {
    this._ELUs.unshift(eventLoopUtilization());
    if (this._ELUs.length > ELUS_LENGTH) {
      this._ELUs.pop();
    }
  }

  private _clearELU() {
    if (!this._ELUs) {
      this._ELUs = [];
    }
    this._ELUs.length = 0;
  }

  // Called when a new `MeterProvider` is set
  // the Meter (result of @opentelemetry/api's getMeter) is available as this.meter within this method
  override _updateMetricInstruments() {
    this.meter
      .createObservableGauge('nodejs.event_loop.utilization', {
        description: 'Event loop utilization',
        unit: '1',
      })
      .addCallback(async observableResult => {
        if (this._ELUs.length !== ELUS_LENGTH) {
          return;
        }
        const elu = eventLoopUtilization(...this._ELUs);
        observableResult.observe(elu.utilization);
      });
  }

  init() {
    // Not instrumenting or patching a Node.js module
  }

  override enable() {
    this._clearELU();
    this._addELU();
    clearInterval(this._interval);
    this._interval = setInterval(
      () => this._addELU(),
      (this._config as RuntimeNodeInstrumentationConfig)
        .eventLoopUtilizationMeasurementInterval
    );

    // unref so that it does not keep the process running if disable() is never called
    this._interval?.unref();
  }

  override disable() {
    this._clearELU();
    clearInterval(this._interval);
    this._interval = undefined;
  }
}
