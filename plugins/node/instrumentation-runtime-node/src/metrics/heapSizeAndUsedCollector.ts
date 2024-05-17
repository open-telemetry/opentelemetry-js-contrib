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
import { HeapSizes } from '../types/heapSizes';
import {
  V8_HEAP_SIZE,
  V8_HEAP_SIZE_STATE_ATTRIBUTE,
} from '../consts/attributes';

export class HeapSizeAndUsedCollector extends BaseCollector<NodeJS.MemoryUsage> {
  constructor(
    config: RuntimeNodeInstrumentationConfig = {},
    namePrefix: string
  ) {
    super(config, namePrefix);
  }

  updateMetricInstruments(meter: Meter): void {
    meter
      .createObservableGauge(`${this.namePrefix}.${V8_HEAP_SIZE}`, {
        description: 'Process heap size from Node.js in bytes.',
        unit: 'By',
      })
      .addCallback(async observableResult => {
        if (this._scrapeQueue.length === 0) return;

        const data = this._scrapeQueue.shift();
        if (data === undefined) return;
        observableResult.observe(data.heapTotal, {
          [`${this.namePrefix}.${V8_HEAP_SIZE_STATE_ATTRIBUTE}`]:
            HeapSizes.Total,
          ...this.versionAttribute,
        });
        observableResult.observe(data.heapUsed, {
          [`${this.namePrefix}.${V8_HEAP_SIZE_STATE_ATTRIBUTE}`]:
            HeapSizes.Used,
          ...this.versionAttribute,
        });
      });
  }

  internalEnable(): void {}

  internalDisable(): void {}

  protected scrape(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }
}
