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

import { Meter } from '@opentelemetry/api';

import { BaseCollector } from './baseCollector';
import {
  ATTR_V8JS_ACTIVE_RESOURCE_TYPE,
  METRIC_V8JS_ACTIVE_RESOURCE,
} from '../semconv';

type DataMap = {
  [key: string]: number;
};

export class ActiveResourcesCollector extends BaseCollector {
  updateMetricInstruments(meter: Meter): void {
    const activeResources = meter.createObservableGauge(
      METRIC_V8JS_ACTIVE_RESOURCE,
      {
        description:
          'Count of the active resources that are currently keeping the event loop alive.',
        unit: '{resource_type}',
      }
    );

    meter.addBatchObservableCallback(
      observableResult => {
        if (!this._config.enabled) return;

        const data = this.scrape();
        if (data === undefined) return;

        // STore the procssed data
        const pdata: DataMap = {};

        // Convert String to string and count
        for (const t of data) {
          const type: string = t.toString();
          if (Object.hasOwn(pdata, type)) {
            pdata[type] += 1;
          } else {
            pdata[type] = 1;
          }
        }

        for (const [key, value] of Object.entries(pdata)) {
          observableResult.observe(activeResources, value, {
            [ATTR_V8JS_ACTIVE_RESOURCE_TYPE]: key,
          });
        }
      },
      [activeResources]
    );
  }

  internalEnable(): void {}

  internalDisable(): void {}

  private scrape(): String[] {
    return process.getActiveResourcesInfo();
  }
}
