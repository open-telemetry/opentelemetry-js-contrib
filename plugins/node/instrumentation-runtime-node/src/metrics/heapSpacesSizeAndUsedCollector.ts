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

const NODEJS_HEAP_SPACE_TOTAL = 'heap_space_total_bytes';
const NODEJS_HEAP_SPACE_USED = 'heap_space_used_bytes';
const NODEJS_HEAP_SPACE_AVAILABLE = 'heap_space_available_bytes';

export const metricNames = [
  {
    name: NODEJS_HEAP_SPACE_TOTAL,
    description: 'Process heap space size total from Node.js in bytes.',
  },
  {
    name: NODEJS_HEAP_SPACE_USED,
    description: 'Process heap space size used from Node.js in bytes.',
  },
  {
    name: NODEJS_HEAP_SPACE_AVAILABLE,
    description: 'Process heap space size available from Node.js in bytes.',
  },
];

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
    const heapSpaceTotal = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[0].name}`,
      {
        description: metricNames[0].description,
        unit: 'bytes',
      }
    );
    const heapSpaceUsed = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[1].name}`,
      {
        description: metricNames[1].description,
        unit: 'bytes',
      }
    );
    const heapSpaceAvailable = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[2].name}`,
      {
        description: metricNames[2].description,
        unit: 'bytes',
      }
    );

    meter.addBatchObservableCallback(
      observableResult => {
        if (this._scrapeQueue.length === 0) return;

        const data = this._scrapeQueue.shift();
        if (data === undefined) return;
        for (const space of data) {
          const spaceName = space.space_name.substring(
            0,
            space.space_name.indexOf('_space')
          );
          observableResult.observe(heapSpaceTotal, space.space_size, {
            space: spaceName,
          });
          observableResult.observe(heapSpaceUsed, space.space_used_size, {
            space: spaceName,
          });
          observableResult.observe(
            heapSpaceAvailable,
            space.space_available_size,
            { space: spaceName }
          );
        }
      },
      [heapSpaceTotal, heapSpaceUsed, heapSpaceAvailable]
    );
  }

  internalEnable(): void {}

  internalDisable(): void {}

  protected scrape(): HeapSpaceInfo[] {
    return v8.getHeapSpaceStatistics();
  }
}
