/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Returns the `db.operation.name` value for a given tedious method and SQL text.
 *
 * - `callProcedure` → `"EXECUTE"`
 * - `execBulkLoad`  → `"BULK INSERT"`
 * - SQL text        → first whitespace-delimited token, uppercased (e.g. `"SELECT"`)
 */
export function getOperationName(
  tediousMethod: string,
  sql: string | undefined
): string | undefined {
  if (tediousMethod === 'callProcedure') return 'EXECUTE';
  if (tediousMethod === 'execBulkLoad') return 'BULK INSERT';
  if (!sql) return undefined;
  const trimmed = sql.trimStart();
  const idx = trimmed.search(/\s/);
  const verb = idx === -1 ? trimmed : trimmed.slice(0, idx);
  const normalized = verb.replace(/;$/, '').toUpperCase();
  return normalized || undefined;
}

/**
 * The span name SHOULD be set to a low cardinality value representing the
 * statement executed on the database, following the OTel convention:
 *   "{db.operation.name} {db.collection.name}"   (when both are known)
 *   "{db.operation.name} {db.namespace}"          (when collection is absent)
 *   "{db.operation.name}"                         (when namespace is absent)
 *   "db"                                          (fallback)
 */
export function getSpanName(
  operationName: string | undefined,
  db: string | undefined,
  collection: string | undefined
): string {
  if (!operationName) return 'db';

  // For stored-procedure calls and bulk loads the "collection" is the
  // procedure / table name, which gives a useful low-cardinality name.
  if (collection && db) {
    return `${operationName} ${collection} ${db}`;
  }
  if (collection) {
    return `${operationName} ${collection}`;
  }
  if (db) {
    return `${operationName} ${db}`;
  }
  return operationName;
}

export const once = (fn: Function) => {
  let called = false;
  return (...args: unknown[]) => {
    if (called) return;
    called = true;
    return fn(...args);
  };
};
