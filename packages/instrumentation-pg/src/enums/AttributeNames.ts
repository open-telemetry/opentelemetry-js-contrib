/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Postgresql specific attributes not covered by semantic conventions
export enum AttributeNames {
  PG_VALUES = 'db.postgresql.values',
  PG_PLAN = 'db.postgresql.plan',
  IDLE_TIMEOUT_MILLIS = 'db.postgresql.idle.timeout.millis',
  MAX_CLIENT = 'db.postgresql.max.client',
}
