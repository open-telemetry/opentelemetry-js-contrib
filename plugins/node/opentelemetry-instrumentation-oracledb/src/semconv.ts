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
 * Copyright (c) 2024, Oracle and/or its affiliates.
 * */

/**
 * The database management system (DBMS) product as identified
 * by the client instrumentation.
 *
 */
export const ATTR_DB_SYSTEM = 'db.system.name';

/**
 * The name of the database, fully qualified within the server address and port.
 *
 * @example FREEPDB1
 * @example XEPDB1
 *
 * @note If a database system has multiple namespace components, they **SHOULD** be concatenated (potentially using database system specific conventions) from most general to most specific namespace component, and more specific namespaces **SHOULD NOT** be captured without the more general namespaces, to ensure that "startswith" queries for the more general namespaces will be valid.
 * Semantic conventions for individual database systems **SHOULD** document what `db.namespace` means in the context of that system.
 * It is **RECOMMENDED** to capture the value as provided by the application without attempting to do any case normalization.
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
