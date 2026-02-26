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

import * as v8 from 'node:v8';

import { Meter } from '@opentelemetry/api';

import { BaseCollector } from './baseCollector';
import { METRIC_V8JS_MEMORY_HEAP_MAX } from '../semconv';

export class HeapSizeLimitCollector extends BaseCollector {
  updateMetricInstruments(meter: Meter): void {
    const heapMax = meter.createObservableGauge(
      METRIC_V8JS_MEMORY_HEAP_MAX,
      {
        description:
          'Maximum heap size allowed by the V8 engine, as set by --max-old-space-size or V8 defaults.',
        unit: 'By',
      }
    );

    meter.addBatchObservableCallback(
      observableResult => {
        if (!this._config.enabled) return;

        const stats = v8.getHeapStatistics();
        observableResult.observe(heapMax, stats.heap_size_limit);
      },
      [heapMax]
    );
  }

  internalEnable(): void {}

  internalDisable(): void {}
}
