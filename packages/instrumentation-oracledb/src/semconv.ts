/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2025, 2026, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * A database operation parameter, with `<key>` being the parameter name, and the attribute value being a string representation of the parameter value.
 *
 * @example someval
 * @example 55
 *
 * @note For example, a client-side maximum number of rows to read from the database
 * **MAY** be recorded as the `db.operation.parameter.max_rows` attribute.
 *
 * `db.query.text` parameters **SHOULD** be captured using `db.query.parameter.<key>`
 * instead of `db.operation.parameter.<key>`.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_DB_OPERATION_PARAMETER = (key: string) =>
  `db.operation.parameter.${key}`;

/**
 * The database domain associated with the connection.
 */
export const ATTR_ORACLE_DB_DOMAIN = 'oracle.db.domain' as const;

/**
 * The instance name associated with the connection in an Oracle Real
 * Application Clusters environment.
 */
export const ATTR_ORACLE_DB_INSTANCE_NAME = 'oracle.db.instance.name' as const;

/**
 * The database name associated with the connection.
 */
export const ATTR_ORACLE_DB_NAME = 'oracle.db.name' as const;

/**
 * The pluggable database (PDB) name associated with the connection.
 */
export const ATTR_ORACLE_DB_PDB = 'oracle.db.pdb' as const;

/**
 * The service name currently associated with the database connection.
 */
export const ATTR_ORACLE_DB_SERVICE = 'oracle.db.service' as const;

/**
 * The state of a connection in the pool
 *
 * @example idle
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_DB_CLIENT_CONNECTION_STATE =
  'db.client.connection.state' as const;

/**
 * Enum value "used" for attribute {@link ATTR_DB_CLIENT_CONNECTION_STATE}.
 */
export const DB_CLIENT_CONNECTION_STATE_VALUE_USED = 'used' as const;

/**
 * Enum value "idle" for attribute {@link ATTR_DB_CLIENT_CONNECTION_STATE}.
 */
export const DB_CLIENT_CONNECTION_STATE_VALUE_IDLE = 'idle' as const;

/**
 * The name of the connection pool; unique within the instrumented application. In case the connection pool implementation doesn't provide a name, instrumentation **SHOULD** use a combination of parameters that would make the name unique, for example, combining attributes `server.address`, `server.port`, and `db.namespace`, formatted as `server.address:server.port/db.namespace`. Instrumentations that generate connection pool name following different patterns **SHOULD** document it.
 *
 * @example myDataSource
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_DB_CLIENT_CONNECTION_POOL_NAME =
  'db.client.connection.pool.name' as const;

/**
 * The number of connections that are currently in state described by the `state` attribute.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_DB_CLIENT_CONNECTION_COUNT =
  'db.client.connection.count' as const;

/**
 * The number of current pending requests for an open connection.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS =
  'db.client.connection.pending_requests' as const;

/**
 * The number of connection timeouts that have occurred trying to obtain a connection from the pool.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const METRIC_DB_CLIENT_CONNECTION_TIMEOUTS =
  'db.client.connection.timeouts' as const;

/**
 * Enum value "oracle.db" for attribute {@link ATTR_DB_SYSTEM_NAME}.
 *
 * [Oracle Database](https://www.oracle.com/database/)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const DB_SYSTEM_NAME_VALUE_ORACLE_DB = 'oracle.db' as const;
