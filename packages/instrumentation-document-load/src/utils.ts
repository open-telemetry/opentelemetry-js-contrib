/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Span } from '@opentelemetry/api';
import {
  hasKey,
  PerformanceEntries,
  PerformanceLegacy,
  PerformanceTimingNames as PTN,
} from '@opentelemetry/sdk-trace-web';
import { EventNames } from './enums/EventNames';

export const getPerformanceNavigationEntries = (): PerformanceEntries => {
  const entries: PerformanceEntries = {};
  const performanceNavigationTiming = performance.getEntriesByType?.(
    'navigation'
  )[0] as PerformanceEntries;

  if (performanceNavigationTiming) {
    const keys = Object.values(PTN);
    keys.forEach((key: string) => {
      if (hasKey(performanceNavigationTiming, key)) {
        const value = performanceNavigationTiming[key];
        if (typeof value === 'number') {
          entries[key] = value;
        }
      }
    });
  } else {
    // // fallback to previous version
    const perf: Performance & PerformanceLegacy = performance as Performance &
      PerformanceLegacy;
    // PerformanceTiming is required for legacy browser support.
    // eslint-disable-next-line baseline-js/use-baseline
    const performanceTiming = perf.timing;
    if (performanceTiming) {
      const keys = Object.values(PTN);
      keys.forEach((key: string) => {
        if (hasKey(performanceTiming, key)) {
          const value = performanceTiming[key];
          if (typeof value === 'number') {
            entries[key as keyof PerformanceEntries] = value;
          }
        }
      });
    }
  }

  return entries;
};

const performancePaintNames = {
  'first-paint': EventNames.FIRST_PAINT,
  'first-contentful-paint': EventNames.FIRST_CONTENTFUL_PAINT,
};

export const addSpanPerformancePaintEvents = (span: Span) => {
  const performancePaintTiming = performance.getEntriesByType?.('paint');
  if (performancePaintTiming) {
    performancePaintTiming.forEach(({ name, startTime }) => {
      if (hasKey(performancePaintNames, name)) {
        span.addEvent(performancePaintNames[name], startTime);
      }
    });
  }
};
