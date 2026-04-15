/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The span name SHOULD be set to a low cardinality value
 * representing the statement executed on the database.
 *
 * @returns Operation executed on Tedious Connection. Does not map to SQL statement in any way.
 */
export function getSpanName(
  operation: string,
  db: string | undefined,
  sql: string | undefined,
  bulkLoadTable: string | undefined
): string {
  if (operation === 'execBulkLoad' && bulkLoadTable && db) {
    return `${operation} ${bulkLoadTable} ${db}`;
  }
  if (operation === 'callProcedure') {
    // `sql` refers to procedure name with `callProcedure`
    if (db) {
      return `${operation} ${sql} ${db}`;
    }
    return `${operation} ${sql}`;
  }
  // do not use `sql` in general case because of high-cardinality
  if (db) {
    return `${operation} ${db}`;
  }
  return `${operation}`;
}

export const once = (fn: Function) => {
  let called = false;
  return (...args: unknown[]) => {
    if (called) return;
    called = true;
    return fn(...args);
  };
};
