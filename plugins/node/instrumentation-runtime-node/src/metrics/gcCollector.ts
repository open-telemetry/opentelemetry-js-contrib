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
import { Histogram, ValueType } from '@opentelemetry/api';
import { BaseCollector } from './baseCollector';
import * as perf_hooks from 'node:perf_hooks';
import { PerformanceObserver } from 'node:perf_hooks';

const NODEJS_GC_DURATION_SECONDS = 'gc.duration';
const DEFAULT_GC_DURATION_BUCKETS = [0.001, 0.01, 0.1, 1, 2, 5];

const kinds: string[] = [];
kinds[perf_hooks.constants.NODE_PERFORMANCE_GC_MAJOR] = 'major';
kinds[perf_hooks.constants.NODE_PERFORMANCE_GC_MINOR] = 'minor';
kinds[perf_hooks.constants.NODE_PERFORMANCE_GC_INCREMENTAL] = 'incremental';
kinds[perf_hooks.constants.NODE_PERFORMANCE_GC_WEAKCB] = 'weakcb';

export class GCCollector extends BaseCollector<null> {
  private _gcDurationByKindHistogram!: Histogram;
  private _observer: PerformanceObserver;

  constructor(
    config: RuntimeNodeInstrumentationConfig = {},
    namePrefix: string
  ) {
    super(config, namePrefix);
    this._observer = new perf_hooks.PerformanceObserver(list => {
      const entry = list.getEntries()[0];
      // Node < 16 uses entry.kind
      // Node >= 16 uses entry.detail.kind
      // See: https://nodejs.org/docs/latest-v16.x/api/deprecations.html#deprecations_dep0152_extension_performanceentry_properties
      // @ts-ignore
      const kind = entry.detail ? kinds[entry.detail.kind] : kinds[entry.kind];
      console.log();
      this._gcDurationByKindHistogram.record(
        entry.duration / 1000,
        Object.assign({ kind })
      );
    });
  }

  updateMetricInstruments(meter: Meter): void {
    this._gcDurationByKindHistogram = meter.createHistogram(
      `${this.namePrefix}.${NODEJS_GC_DURATION_SECONDS}`,
      {
        description:
          'Garbage collection duration by kind, one of major, minor, incremental or weakcb.',
        unit: 's',
        valueType: ValueType.DOUBLE,
        advice: {
          explicitBucketBoundaries: DEFAULT_GC_DURATION_BUCKETS,
        },
      }
    );
  }

  internalEnable(): void {
    this._observer.observe({ entryTypes: ['gc'] });
  }

  internalDisable(): void {
    this._observer.disconnect();
  }

  protected scrape(): null {
    return null;
  }
}
