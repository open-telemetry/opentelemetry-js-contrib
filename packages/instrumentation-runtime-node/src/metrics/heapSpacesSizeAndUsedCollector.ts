/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as v8 from 'node:v8';
import type { HeapSpaceInfo } from 'v8';

import { Meter } from '@opentelemetry/api';

import { BaseCollector } from './baseCollector';
import {
  ATTR_V8JS_HEAP_SPACE_NAME,
  METRIC_V8JS_MEMORY_HEAP_LIMIT,
  METRIC_V8JS_MEMORY_HEAP_SPACE_SIZE,
  METRIC_V8JS_MEMORY_HEAP_USED,
  METRIC_V8JS_MEMORY_HEAP_SPACE_AVAILABLE_SIZE,
  METRIC_V8JS_MEMORY_HEAP_SPACE_PHYSICAL_SIZE,
} from '../semconv';

export class HeapSpacesSizeAndUsedCollector extends BaseCollector {
  updateMetricInstruments(meter: Meter): void {
    const heapLimit = meter.createObservableUpDownCounter(
      METRIC_V8JS_MEMORY_HEAP_LIMIT,
      {
        description:
          'Maximum heap size allowed by the V8 engine, as set by --max-old-space-size or V8 defaults.',
        unit: 'By',
      }
    );
    const heapSpaceSize = meter.createObservableUpDownCounter(
      METRIC_V8JS_MEMORY_HEAP_SPACE_SIZE,
      {
        description: 'Total heap memory size pre-allocated for a heap space.',
        unit: 'By',
      }
    );
    const heapSpaceUsed = meter.createObservableGauge(
      METRIC_V8JS_MEMORY_HEAP_USED,
      {
        description: 'Heap Memory size allocated.',
        unit: 'By',
      }
    );
    const heapSpaceAvailable = meter.createObservableGauge(
      METRIC_V8JS_MEMORY_HEAP_SPACE_AVAILABLE_SIZE,
      {
        description: 'Heap space available size.',
        unit: 'By',
      }
    );
    const heapSpacePhysical = meter.createObservableGauge(
      METRIC_V8JS_MEMORY_HEAP_SPACE_PHYSICAL_SIZE,
      {
        description: 'Committed size of a heap space.',
        unit: 'By',
      }
    );

    meter.addBatchObservableCallback(
      observableResult => {
        if (!this._config.enabled) return;

        const heapStats = v8.getHeapStatistics();
        observableResult.observe(heapLimit, heapStats.heap_size_limit);

        const data = this.scrape();
        if (data === undefined) return;
        for (const space of data) {
          const spaceName = space.space_name;

          observableResult.observe(heapSpaceSize, space.space_size, {
            [ATTR_V8JS_HEAP_SPACE_NAME]: spaceName,
          });

          observableResult.observe(heapSpaceUsed, space.space_used_size, {
            [ATTR_V8JS_HEAP_SPACE_NAME]: spaceName,
          });

          observableResult.observe(
            heapSpaceAvailable,
            space.space_available_size,
            {
              [ATTR_V8JS_HEAP_SPACE_NAME]: spaceName,
            }
          );

          observableResult.observe(
            heapSpacePhysical,
            space.physical_space_size,
            {
              [ATTR_V8JS_HEAP_SPACE_NAME]: spaceName,
            }
          );
        }
      },
      [
        heapLimit,
        heapSpaceSize,
        heapSpaceUsed,
        heapSpaceAvailable,
        heapSpacePhysical,
      ]
    );
  }

  internalEnable(): void {}

  internalDisable(): void {}

  private scrape(): HeapSpaceInfo[] {
    return v8.getHeapSpaceStatistics();
  }
}
