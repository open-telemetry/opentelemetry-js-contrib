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

type DataMap = Record<string, number>;

export class ActiveResourcesCollector extends BaseCollector {
  private _knownTypes: Set<string> = new Set();

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
          this._knownTypes.add(type);
        }

        for (const key of this._knownTypes) {
          observableResult.observe(
            activeResources,
            Object.hasOwn(pdata, key) ? pdata[key] : 0,
            { [ATTR_V8JS_RESOURCE_TYPE]: key }
          );
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
