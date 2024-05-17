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

import { Span } from '@opentelemetry/api';
import { otperformance } from '@opentelemetry/core';
import {
  hasKey,
  PerformanceEntries,
  PerformanceLegacy,
  PerformanceTimingNames as PTN,
} from '@opentelemetry/sdk-trace-web';
import { EventNames } from './enums/EventNames';

export const getPerformanceNavigationEntries = (): PerformanceEntries => {
  const entries: PerformanceEntries = {};
  const performanceNavigationTiming = (
    otperformance as unknown as Performance
  ).getEntriesByType?.('navigation')[0] as PerformanceEntries;

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
    const perf: typeof otperformance & PerformanceLegacy = otperformance;
    const performanceTiming = perf.timing;
    if (performanceTiming) {
      const keys = Object.values(PTN);
      keys.forEach((key: string) => {
        if (hasKey(performanceTiming, key)) {
          const value = performanceTiming[key];
          if (typeof value === 'number') {
            entries[key] = value;
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
  const performancePaintTiming = (
    otperformance as unknown as Performance
  ).getEntriesByType?.('paint');
  if (performancePaintTiming) {
    performancePaintTiming.forEach(({ name, startTime }) => {
      if (hasKey(performancePaintNames, name)) {
        span.addEvent(performancePaintNames[name], startTime);
      }
    });
  }
};
