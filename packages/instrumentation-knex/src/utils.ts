/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Exception } from '@opentelemetry/api';
import { DB_SYSTEM_NAME_VALUE_POSTGRESQL } from '@opentelemetry/semantic-conventions';
import { DB_SYSTEM_NAME_VALUE_SQLITE } from './semconv';

type KnexError = Error & {
  code?: string;
};

export const getFormatter = (runner: any) => {
  if (runner) {
    if (runner.client) {
      if (runner.client._formatQuery) {
        return runner.client._formatQuery.bind(runner.client);
      } else if (runner.client.SqlString) {
        return runner.client.SqlString.format.bind(runner.client.SqlString);
      }
    }
    if (runner.builder) {
      return runner.builder.toString.bind(runner.builder);
    }
  }
  return () => '<noop formatter>';
};

export function otelExceptionFromKnexError(
  err: KnexError,
  message: string
): Exception {
  if (!(err && err instanceof Error)) {
    return err;
  }

  return {
    message,
    code: err.code,
    stack: err.stack,
    name: err.name,
  };
}

const systemMap = new Map([
  ['sqlite3', DB_SYSTEM_NAME_VALUE_SQLITE],
  ['pg', DB_SYSTEM_NAME_VALUE_POSTGRESQL],
]);

export const mapSystem = (knexSystem: string) => {
  return systemMap.get(knexSystem) || knexSystem;
};

export const getName = (db: string, operation?: string, table?: string) => {
  if (operation) {
    if (table) {
      return `${operation} ${db}.${table}`;
    }
    return `${operation} ${db}`;
  }
  return db;
};

export const limitLength = (str: string, maxLength: number) => {
  if (
    typeof str === 'string' &&
    typeof maxLength === 'number' &&
    0 < maxLength &&
    maxLength < str.length
  ) {
    return str.substring(0, maxLength) + '..';
  }
  return str;
};

/**
 * Helpers to extract connection details from a Knex connectionString.
 * When Knex is configured via `connection.connectionString` instead of
 * explicit fields like `host`, `port`, and `database`, these values are
 * embedded in the URL and must be parsed out.
 * e.g. "postgres://user:pass@localhost:5432/mydb"
 */

export const extractDatabaseFromConnectionString = (
  connectionString?: string
): string | undefined => {
  if (!connectionString) return undefined;
  try {
    const db = new URL(connectionString).pathname?.replace(/^\//, '');
    return db || undefined;
  } catch {
    return undefined;
  }
};

export const extractHostFromConnectionString = (
  connectionString?: string
): string | undefined => {
  if (!connectionString) return undefined;
  try {
    return new URL(connectionString).hostname || undefined;
  } catch {
    return undefined;
  }
};

export const extractPortFromConnectionString = (
  connectionString?: string
): number | undefined => {
  if (!connectionString) return undefined;
  try {
    const port = new URL(connectionString).port;
    return port ? parseInt(port, 10) : undefined;
  } catch {
    return undefined;
  }
};

export const extractTableName = (builder: any): string => {
  const table = builder?._single?.table;
  if (typeof table === 'object') {
    return extractTableName(table);
  }
  return table;
};
