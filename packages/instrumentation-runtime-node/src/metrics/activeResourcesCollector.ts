/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Meter } from '@opentelemetry/api';

import { BaseCollector } from './baseCollector';
import {
  ATTR_V8JS_RESOURCE_TYPE,
  METRIC_V8JS_RESOURCE_ACTIVE,
} from '../semconv';

type DataMap = {
  [key: string]: number;
};

export class ActiveResourcesCollector extends BaseCollector {
  updateMetricInstruments(meter: Meter): void {
    const activeResources = meter.createObservableGauge(
      METRIC_V8JS_RESOURCE_ACTIVE,
      {
        description:
          'Count of the active resources that are currently keeping the event loop alive.',
        unit: '{resource}',
      }
    );

    meter.addBatchObservableCallback(
      observableResult => {
        if (!this._config.enabled) return;

        const data = this.scrape();

        const pdata: DataMap = {};

        for (const type of data) {
          if (Object.hasOwn(pdata, type)) {
            pdata[type] += 1;
          } else {
            pdata[type] = 1;
          }
        }

        for (const [key, value] of Object.entries(pdata)) {
          observableResult.observe(activeResources, value, {
            [ATTR_V8JS_RESOURCE_TYPE]: key,
          });
        }
      },
      [activeResources]
    );
  }

  internalEnable(): void {}

  internalDisable(): void {}

  private scrape(): string[] {
    return process.getActiveResourcesInfo();
  }
}
