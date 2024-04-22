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

const NODEJS_HEAP_SIZE_TOTAL = 'heap_size_total_bytes';
const NODEJS_HEAP_SIZE_USED = 'heap_size_used_bytes';
const NODEJS_EXTERNAL_MEMORY = 'external_memory_bytes';

export const metricNames = [
  {
    name: NODEJS_HEAP_SIZE_TOTAL,
    description: 'Process heap size from Node.js in bytes.',
  },
  {
    name: NODEJS_HEAP_SIZE_USED,
    description: 'Process heap size used from Node.js in bytes.',
  },
  {
    name: NODEJS_EXTERNAL_MEMORY,
    description: 'Node.js external memory size in bytes.',
  },
];

export class HeapSizeAndUsedCollector extends BaseCollector<NodeJS.MemoryUsage> {
  constructor(
    config: RuntimeNodeInstrumentationConfig = {},
    namePrefix: string
  ) {
    super(config, namePrefix);
  }

  updateMetricInstruments(meter: Meter): void {
    const heapSizeTotal = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[0].name}`,
      {
        description: metricNames[0].description,
        unit: '1',
      }
    );
    const heapSizeUsed = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[1].name}`,
      {
        description: metricNames[1].description,
        unit: '1',
      }
    );
    const externalMemUsed = meter.createObservableGauge(
      `${this.namePrefix}.${metricNames[2].name}`,
      {
        description: metricNames[2].description,
        unit: '1',
      }
    );

    meter.addBatchObservableCallback(
      observableResult => {
        if (this._scrapeQueue.length === 0) return;

        const data = this._scrapeQueue.shift();
        if (data === undefined) return;
        observableResult.observe(heapSizeTotal, data.heapTotal);
        observableResult.observe(heapSizeUsed, data.heapUsed);
        if (data.external !== undefined) {
          observableResult.observe(externalMemUsed, data.external);
        }
      },
      [heapSizeTotal, heapSizeUsed, externalMemUsed]
    );
  }

  internalEnable(): void {}

  internalDisable(): void {}

  protected scrape(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }
}
