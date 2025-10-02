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
import type { HeapSpaceInfo } from 'v8';

import { Meter } from '@opentelemetry/api';

import { BaseCollector } from './baseCollector';
import {
  ATTR_V8JS_HEAP_SPACE_NAME,
  METRIC_V8JS_MEMORY_HEAP_LIMIT,
  METRIC_V8JS_MEMORY_HEAP_USED,
} from '../semconv';

export class HeapSpacesSizeAndUsedCollector extends BaseCollector {
  updateMetricInstruments(meter: Meter): void {
    const heapLimit = meter.createObservableGauge(
      METRIC_V8JS_MEMORY_HEAP_LIMIT,
      {
        description: 'Total heap memory size pre-allocated.',
        unit: 'By',
      }
    );
    const heapSpaceUsed = meter.createObservableGauge(
      METRIC_V8JS_MEMORY_HEAP_USED,
      {
        description: 'Heap Memory size allocated.',
        unit: 'By',
      }
    );
    const heapSpaceAvailable = meter.createObservableGauge(
      // TODO: Use METRIC_V8JS_MEMORY_HEAP_SPACE_AVAILABLE_SIZE when available in semconv v1.38.0
      'v8js.memory.heap.space.available_size',
      {
        description: 'Heap space available size.',
        unit: 'By',
      }
    );
    const heapSpacePhysical = meter.createObservableGauge(
      // TODO: Use METRIC_V8JS_MEMORY_HEAP_SPACE_PHYSICAL_SIZE when available in semconv v1.38.0
      'v8js.memory.heap.space.physical_size',
      {
        description: 'Committed size of a heap space.',
        unit: 'By',
      }
    );

    meter.addBatchObservableCallback(
      observableResult => {
        if (!this._config.enabled) return;

        const data = this.scrape();
        if (data === undefined) return;
        for (const space of data) {
          const spaceName = space.space_name;

          observableResult.observe(heapLimit, space.space_size, {
            [ATTR_V8JS_HEAP_SPACE_NAME]: spaceName,
          });

          observableResult.observe(heapSpaceUsed, space.space_used_size, {
            [ATTR_V8JS_HEAP_SPACE_NAME]: spaceName,
          });

          observableResult.observe(
            heapSpaceAvailable,
            space.space_available_size,
            {
              [ATTR_V8JS_HEAP_SPACE_NAME]: spaceName,
            }
          );

          observableResult.observe(
            heapSpacePhysical,
            space.physical_space_size,
            {
              [ATTR_V8JS_HEAP_SPACE_NAME]: spaceName,
            }
          );
        }
      },
      [heapLimit, heapSpaceUsed, heapSpaceAvailable, heapSpacePhysical]
    );
  }

  internalEnable(): void {}

  internalDisable(): void {}

  private scrape(): HeapSpaceInfo[] {
    return v8.getHeapSpaceStatistics();
  }
}
