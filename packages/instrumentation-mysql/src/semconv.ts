/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * Deprecated, use `db.client.connection.count` instead.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `db.client.connection.count`.
 */
export const METRIC_DB_CLIENT_CONNECTIONS_USAGE =
  'db.client.connections.usage' as const;
