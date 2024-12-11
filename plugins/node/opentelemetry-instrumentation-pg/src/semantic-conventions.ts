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
 */

/**
 * These constants are considered experimental exports of `@opentelemetry/semantic-conventions`.
 * They're being inlined until they're officially exported by `@opentelemetry/semantic-conventions`.
 */

/**
 * The number of connections that are currently in state described by the `state` attribute
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export declare const METRIC_DB_CLIENT_CONNECTION_COUNT: 'db.client.connection.count';

/**
 * The number of pending requests for an open connection, cumulative for the entire pool
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export declare const METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS: 'db.client.connection.pending_requests';

/**
 * Duration of database client operations.
 *
 * @note Batch operations **SHOULD** be recorded as a single operation.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export declare const METRIC_DB_CLIENT_OPERATION_DURATION: 'db.client.operation.duration';

/**
 * The name of the database, fully qualified within the server address and port.
 *
 * @example customers
 *
 * @example test.users
 *
 * @note If a database system has multiple namespace components, they **SHOULD** be concatenated (potentially using database system specific conventions) from most general to most specific namespace component, and more specific namespaces **SHOULD** **NOT** be captured without the more general namespaces, to ensure that "startswith" queries for the more general namespaces will be valid.
 * Semantic conventions for individual database systems **SHOULD** document what `db.namespace` means in the context of that system.
 * It is RECOMMENDED to capture the value as provided by the application without attempting to do any case normalization.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export declare const ATTR_DB_NAMESPACE: 'db.namespace';

/**
 * The name of the operation or command being executed.
 *
 * @example findAndModify
 *
 * @example HMSET
 *
 * @example SELECT
 *
 * @note It is RECOMMENDED to capture the value as provided by the application without attempting to do any case normalization.
 * If the operation name is parsed from the query text, it **SHOULD** be the first operation name found in the query.
 * For batch operations, if the individual operations are known to have the same operation name then that operation name **SHOULD** be used prepended by `BATCH `, otherwise `db.operation.name` **SHOULD** be `BATCH` or some other database system specific term if more applicable.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export declare const ATTR_DB_OPERATION_NAME: 'db.operation.name';
