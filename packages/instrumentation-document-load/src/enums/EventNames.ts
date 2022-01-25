/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export enum EventNames {
  FIRST_PAINT = 'firstPaint',
  FIRST_CONTENTFUL_PAINT = 'firstContentfulPaint',
  LARGEST_CONTENTFUL_PAINT = 'largestContentfulPaint',
  CUMULATIVE_LAYOUT_SHIFT = 'cumulativeLayoutShift',
  FIRST_INPUT_DELAY = 'firstInputDelay',
  TIME_TO_FIRST_BYTE = 'timeToFirstByte'
}
