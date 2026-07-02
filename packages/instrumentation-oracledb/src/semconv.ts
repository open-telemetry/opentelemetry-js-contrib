/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2025, Oracle and/or its affiliates.
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
 * Deprecated, no replacement at this time.
 *
 * @example readonly_user
 * @example reporting_user
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Removed, no replacement at this time.
 */
export const ATTR_DB_USER = 'db.user' as const;

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
 * Enum value "oracle.db" for attribute {@link ATTR_DB_SYSTEM_NAME}.
 *
 * [Oracle Database](https://www.oracle.com/database/)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const DB_SYSTEM_NAME_VALUE_ORACLE_DB = 'oracle.db' as const;
