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
 * Deprecated, use `messaging.operation.type` instead.
 *
 * @example publish
 * @example create
 * @example process
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `messaging.operation.type`.
 */
export const ATTR_MESSAGING_OPERATION = 'messaging.operation' as const;

/**
 * The messaging system as identified by the client instrumentation.
 *
 * @note The actual messaging system may differ from the one known by the client. For example, when using Kafka client libraries to communicate with Azure Event Hubs, the `messaging.system` is set to `kafka` based on the instrumentation's best knowledge.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_SYSTEM = 'messaging.system' as const;

/**
 * The RabbitMQ cluster name, obtained from the broker metadata exposed
 * through the RabbitMQ client API.
 *
 * @note Not yet part of `@opentelemetry/semantic-conventions` — tracked in
 * https://github.com/open-telemetry/semantic-conventions/issues/3997. Mirrors
 * `messaging.kafka.cluster.id` in shape.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_RABBITMQ_CLUSTER_NAME =
  'messaging.rabbitmq.cluster.name' as const;

/**
 * The name of the RabbitMQ virtual host that the messaging operation is
 * scoped to.
 *
 * @note Not yet part of `@opentelemetry/semantic-conventions` — tracked in
 * https://github.com/open-telemetry/semantic-conventions/issues/3997.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_RABBITMQ_VHOST_NAME =
  'messaging.rabbitmq.vhost.name' as const;
