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
import { V8_HEAP_SIZE_STATE_ATTRIBUTE } from '../consts/attributes';

export enum V8HeapSpaceMetrics {
  spaceSize = 'heap.space_size',
  used = 'heap.space_used_size',
  available = 'heap.space_available_size',
  physical = 'heap.physical_space_size',
}

export const metricNames: Record<V8HeapSpaceMetrics, { description: string }> =
  {
    [V8HeapSpaceMetrics.spaceSize]: {
      description: 'Process heap space size total from Node.js in bytes.',
    },
    [V8HeapSpaceMetrics.used]: {
      description: 'Process heap space size used from Node.js in bytes.',
    },
    [V8HeapSpaceMetrics.available]: {
      description: 'Process heap space size available from Node.js in bytes.',
    },
    [V8HeapSpaceMetrics.physical]: {
      description: 'Process heap space size available from Node.js in bytes.',
    },
  };

export class HeapSpacesSizeAndUsedCollector extends BaseCollector<
  HeapSpaceInfo[]
> {
  constructor(
    config: RuntimeNodeInstrumentationConfig = {},
    namePrefix: string
  ) {
    super(config, namePrefix);
  }

  updateMetricInstruments(meter: Meter): void {
    const heapSpaceSize = meter.createObservableGauge(
      `${this.namePrefix}.${V8HeapSpaceMetrics.spaceSize}`,
      {
        description: metricNames[V8HeapSpaceMetrics.spaceSize].description,
        unit: 'bytes',
      }
    );
    const heapSpaceUsed = meter.createObservableGauge(
      `${this.namePrefix}.${V8HeapSpaceMetrics.used}`,
      {
        description: metricNames[V8HeapSpaceMetrics.used].description,
        unit: 'bytes',
      }
    );
    const heapSpaceAvailable = meter.createObservableGauge(
      `${this.namePrefix}.${V8HeapSpaceMetrics.available}`,
      {
        description: metricNames[V8HeapSpaceMetrics.available].description,
        unit: 'bytes',
      }
    );
    const heapSpacePhysical = meter.createObservableGauge(
      `${this.namePrefix}.${V8HeapSpaceMetrics.physical}`,
      {
        description: metricNames[V8HeapSpaceMetrics.physical].description,
        unit: 'bytes',
      }
    );
    const heapSpaceNameAttributeName = `${this.namePrefix}.${V8_HEAP_SIZE_STATE_ATTRIBUTE}`;

    meter.addBatchObservableCallback(
      observableResult => {
        if (this._scrapeQueue.length === 0) return;

        const data = this._scrapeQueue.shift();
        if (data === undefined) return;
        for (const space of data) {
          const spaceName = space.space_name;

          observableResult.observe(heapSpaceSize, space.space_size, {
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
      [heapSpaceSize, heapSpaceUsed, heapSpaceAvailable, heapSpacePhysical]
    );
  }

  internalEnable(): void {}

  internalDisable(): void {}

  protected scrape(): HeapSpaceInfo[] {
    return v8.getHeapSpaceStatistics();
  }
}
