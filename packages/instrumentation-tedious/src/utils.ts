/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Returns the `db.operation.name` value for a given tedious method.
 *
 * - `callProcedure` → `"EXECUTE"`
 * - `execBulkLoad`  → `"BULK INSERT"`
 */
export function getOperationName(tediousMethod: string): string | undefined {
  if (tediousMethod === 'callProcedure') return 'EXECUTE';
  if (tediousMethod === 'execBulkLoad') return 'BULK INSERT';
  return undefined;
}

/**
 *   {db.operation.name} {target}
 *   {db.operation.name}
 *   {target}
 *   {db.system.name}
 *
 * where {target} resolves to db.collection.name first, then db.namespace.
 */
export function getSpanName(
  operationName: string | undefined,
  db: string | undefined,
  collection: string | undefined,
  dbSystemName: string
): string {
  // {target} = db.collection.name preferred over db.namespace
  const target = collection ?? db;
  if (operationName && target) return `${operationName} ${target}`;
  if (operationName) return operationName;
  if (target) return target;
  return dbSystemName;
}

export const once = (fn: Function) => {
  let called = false;
  return (...args: unknown[]) => {
    if (called) return;
    called = true;
    return fn(...args);
  };
};
