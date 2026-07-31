/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Contains span names produced by instrumentation
export enum SpanNames {
  QUERY_PREFIX = 'pg.query',
  CONNECT = 'pg.connect',
  POOL_CONNECT = 'pg-pool.connect',
}
