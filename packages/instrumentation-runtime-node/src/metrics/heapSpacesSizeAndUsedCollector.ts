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
import { BaseCollector } from './baseCollector';
import * as v8 from 'node:v8';
import { HeapSpaceInfo } from 'v8';
import { ATTR_V8JS_HEAP_SPACE_NAME } from '../consts/attributes';

export enum V8HeapSpaceMetrics {
  heapLimit = 'memory.heap.limit',
  used = 'memory.heap.used',
  available = 'memory.heap.space.available_size',
  physical = 'memory.heap.space.physical_size',
}

export const metricNames: Record<V8HeapSpaceMetrics, { description: string }> =
  {
    [V8HeapSpaceMetrics.heapLimit]: {
      description: 'Total heap memory size pre-allocated.',
    },
    [V8HeapSpaceMetrics.used]: {
      description: 'Heap Memory size allocated.',
    },
    [V8HeapSpaceMetrics.available]: {
      description: 'Heap space available size.',
    },
    [V8HeapSpaceMetrics.physical]: {
      description: 'Committed size of a heap space.',
    },
  };

export class HeapSpacesSizeAndUsedCollector extends BaseCollector {
  constructor(
    config: RuntimeNodeInstrumentationConfig = {},
    namePrefix: string
  ) {
    super(config, namePrefix);
  }

  updateMetricInstruments(meter: Meter): void {
    const heapLimit = meter.createObservableGauge(
      `${this.namePrefix}.${V8HeapSpaceMetrics.heapLimit}`,
      {
        description: metricNames[V8HeapSpaceMetrics.heapLimit].description,
        unit: 'By',
      }
    );
    const heapSpaceUsed = meter.createObservableGauge(
      `${this.namePrefix}.${V8HeapSpaceMetrics.used}`,
      {
        description: metricNames[V8HeapSpaceMetrics.used].description,
        unit: 'By',
      }
    );
    const heapSpaceAvailable = meter.createObservableGauge(
      `${this.namePrefix}.${V8HeapSpaceMetrics.available}`,
      {
        description: metricNames[V8HeapSpaceMetrics.available].description,
        unit: 'By',
      }
    );
    const heapSpacePhysical = meter.createObservableGauge(
      `${this.namePrefix}.${V8HeapSpaceMetrics.physical}`,
      {
        description: metricNames[V8HeapSpaceMetrics.physical].description,
        unit: 'By',
      }
    );
    const heapSpaceNameAttributeName = `${this.namePrefix}.${ATTR_V8JS_HEAP_SPACE_NAME}`;

    meter.addBatchObservableCallback(
      observableResult => {
        if (!this._config.enabled) return;

        const data = this.scrape();
        if (data === undefined) return;
        for (const space of data) {
          const spaceName = space.space_name;

          observableResult.observe(heapLimit, space.space_size, {
            [heapSpaceNameAttributeName]: spaceName,
          });

          observableResult.observe(heapSpaceUsed, space.space_used_size, {
            [heapSpaceNameAttributeName]: spaceName,
          });

          observableResult.observe(
            heapSpaceAvailable,
            space.space_available_size,
            {
              [heapSpaceNameAttributeName]: spaceName,
            }
          );

          observableResult.observe(
            heapSpacePhysical,
            space.physical_space_size,
            {
              [heapSpaceNameAttributeName]: spaceName,
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
