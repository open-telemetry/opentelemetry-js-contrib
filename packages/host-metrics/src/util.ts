/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export function ObjectKeys<T extends Record<string, unknown>>(t: T) {
  return Object.keys(t) as (keyof T)[];
}
