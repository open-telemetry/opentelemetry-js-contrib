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
import {RuntimeNodeInstrumentationConfig} from '../types';
import {Meter} from '@opentelemetry/api';
import {BaseCollector} from './baseCollector';
import * as v8 from 'node:v8';
import {HeapSpaceInfo} from 'v8';
import {HeapSpaces} from "../types/heapSpaces";

const NODEJS_HEAP_SPACE = 'heap.space';
const NODEJS_HEAP_SPACE_STATE = 'heap.space.state';
const NODEJS_HEAP_SPACE_SPACENAME = 'heap.space.spacename';


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
    meter.createObservableGauge(
      `${this.namePrefix}.${NODEJS_HEAP_SPACE}`,
      {
        description: "Process heap space size total from Node.js in bytes.",
        unit: 'By',
      }
    ).addCallback(async observableResult => {
      if (this._scrapeQueue.length === 0) return;

      const data = this._scrapeQueue.shift();
      if (data === undefined) return;
      for (const space of data) {
        const spaceName = space.space_name.substring(
          0,
          space.space_name.indexOf('_space')
        );
        observableResult.observe(space.space_size, {
          [`${this.namePrefix}.${NODEJS_HEAP_SPACE_SPACENAME}`]: spaceName,
          [`${this.namePrefix}.${NODEJS_HEAP_SPACE_STATE}`]: HeapSpaces.Total
        });
        observableResult.observe(space.space_used_size, {
          [`${this.namePrefix}.${NODEJS_HEAP_SPACE_SPACENAME}`]: spaceName,
          [`${this.namePrefix}.${NODEJS_HEAP_SPACE_STATE}`]: HeapSpaces.Used

        });
        observableResult.observe(
          space.space_available_size,
          {
            [`${this.namePrefix}.${NODEJS_HEAP_SPACE_SPACENAME}`]: spaceName,
            [`${this.namePrefix}.${NODEJS_HEAP_SPACE_STATE}`]: HeapSpaces.Availabe
          }
        );
      }
    });

  }

  internalEnable(): void {
  }

  internalDisable(): void {
  }

  protected scrape(): HeapSpaceInfo[] {
    return v8.getHeapSpaceStatistics();
  }
}
