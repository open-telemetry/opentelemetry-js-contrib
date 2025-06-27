/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Copyright (c) 2025, Oracle and/or its affiliates.
 * */

/**
 * The database management system (DBMS) product as identified
 * by the client instrumentation.
 *
 */
export const ATTR_DB_SYSTEM = 'db.system.name';

/**
 * The database associated with the connection, qualified by the instance name, database name and service name.
 *
 * @example ORCL1|PDB1|db_high.adb.oraclecloud.com
 * @example ORCL1|DB1|db_low.adb.oraclecloud.com
 *
 * @note It **SHOULD** be set to the combination of instance name, database name and
 * service name following the `{instance_name}|{database_name}|{service_name}` pattern.
 * For CDB architecture, database name would be pdb name. For Non-CDB, it would be
 * **DB_NAME** parameter.
 * This attribute has stability level RELEASE CANDIDATE.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_DB_NAMESPACE = 'db.namespace';

/**
 * The name of the operation or command being executed.
 *
 * @example INSERT
 * @example COMMIT
 * @example SELECT
 *
 * @note It is **RECOMMENDED** to capture the value as provided by the application without attempting to do any case normalization.
 * If the operation name is parsed from the query text, it **SHOULD** be the first operation name found in the query.
 * For batch operations, if the individual operations are known to have the same operation name then that operation name **SHOULD** be used prepended by `BATCH `, otherwise `db.operation.name` **SHOULD** be `BATCH` or some other database system specific term if more applicable.
 * This attribute has stability level RELEASE CANDIDATE.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_DB_OPERATION_NAME = 'db.operation.name';

/**
 * The database query being executed.
 *
 * @example SELECT * FROM wuser_table where username = :1 // bind by position
 * @example SELECT * FROM wuser_table where username = :name // bind by name
 * @example SELECT * FROM wuser_table where username = 'John' // literals
 *
 * @note For sanitization see [Sanitization of `db.query.text`](../database/database-spans.md#sanitization-of-dbquerytext).
 * For batch operations, if the individual operations are known to have the same query text then
 * that query text **SHOULD** be used, otherwise all of the individual query texts **SHOULD**
 * be concatenated with separator `; ` or some other database system specific separator if more applicable.
 *
 * Non-parameterized or Parameterized query text **SHOULD NOT** be collected by default unless
 * explicitly configured and sanitized to exclude sensitive data, e.g. by redacting all
 * literal values present in the query text. See Sanitization of `db.query.text`.
 *
 * Parameterized query text MUST also NOT be collected by default unless explicitly configured.
 * The query parameter values themselves are opt-in, see [`db.operation.parameter.<key>`](../attributes-registry/db.md))
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_DB_STATEMENT = 'db.query.text';

/**
 * A database operation parameter, with <key> being the parameter name,
 * and the attribute value being a string representation of the parameter value.
 *
 * @example someval
 * @example 55
 *
 * @note  If a parameter has no name and instead is referenced only by index, then
 * <key> **SHOULD** be the 0-based index. If `db.query.text` is also captured, then
 * `db.operation.parameter.<key>` **SHOULD** match up with the parameterized placeholders
 * present in db.query.text
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_DB_OPERATION_PARAMETER = 'db.operation.parameter';

/**
 * Username for accessing the database.
 *
 */
export const ATTR_DB_USER = 'db.user';
