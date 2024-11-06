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

import { RuntimeNodeInstrumentationConfig } from './types';
import { MetricCollector } from './types/metricCollector';
import { EventLoopUtilizationCollector } from './metrics/eventLoopUtilizationCollector';
import { EventLoopDelayCollector } from './metrics/eventLoopDelayCollector';
import { GCCollector } from './metrics/gcCollector';
import { HeapSpacesSizeAndUsedCollector } from './metrics/heapSpacesSizeAndUsedCollector';
import { ConventionalNamePrefix } from './types/ConventionalNamePrefix';
import { EventLoopTimeCollector } from './metrics/eventLoopTimeCollector';
/** @knipignore */
import { PACKAGE_VERSION, PACKAGE_NAME } from './version';

const DEFAULT_CONFIG: RuntimeNodeInstrumentationConfig = {
  monitoringPrecision: 10,
};

export class RuntimeNodeInstrumentation extends InstrumentationBase<RuntimeNodeInstrumentationConfig> {
  private readonly _collectors: MetricCollector[] = [];

  constructor(config: RuntimeNodeInstrumentationConfig = {}) {
    super(
      PACKAGE_NAME,
      PACKAGE_VERSION,
      Object.assign({}, DEFAULT_CONFIG, config)
    );
    this._collectors = [
      new EventLoopUtilizationCollector(
        this._config,
        ConventionalNamePrefix.NodeJs
      ),
      new EventLoopTimeCollector(this._config, ConventionalNamePrefix.NodeJs),
      new EventLoopDelayCollector(this._config, ConventionalNamePrefix.NodeJs),
      new GCCollector(this._config, ConventionalNamePrefix.V8js),
      new HeapSpacesSizeAndUsedCollector(
        this._config,
        ConventionalNamePrefix.V8js
      ),
    ];
    if (this._config.enabled) {
      for (const collector of this._collectors) {
        collector.enable();
      }
    }
  }

  // Called when a new `MeterProvider` is set
  // the Meter (result of @opentelemetry/api's getMeter) is available as this.meter within this method
  override _updateMetricInstruments() {
    if (!this._collectors) return;
    for (const collector of this._collectors) {
      collector.updateMetricInstruments(this.meter);
    }
  }

  init() {
    // Not instrumenting or patching a Node.js module
  }

  override enable() {
    if (!this._collectors) return;

    for (const collector of this._collectors) {
      collector.enable();
    }
  }

  override disable() {
    for (const collector of this._collectors) {
      collector.disable();
    }
  }
}
