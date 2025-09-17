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

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * Deprecated, use `network.local.address`.
 *
 * @example "192.168.0.1"
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `network.local.address`.
 */
export const ATTR_NET_HOST_IP = 'net.host.ip' as const;

/**
 * Deprecated, use `server.port`.
 *
 * @example 8080
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `server.port`.
 */
export const ATTR_NET_HOST_PORT = 'net.host.port' as const;

/**
 * Deprecated, use `network.peer.address`.
 *
 * @example "127.0.0.1"
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `network.peer.address`.
 */
export const ATTR_NET_PEER_IP = 'net.peer.ip' as const;

/**
 * Deprecated, use `server.address` on client spans and `client.address` on server spans.
 *
 * @example example.com
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `server.address` on client spans and `client.address` on server spans.
 */
export const ATTR_NET_PEER_NAME = 'net.peer.name' as const;

/**
 * Deprecated, use `server.port` on client spans and `client.port` on server spans.
 *
 * @example 8080
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `server.port` on client spans and `client.port` on server spans.
 */
export const ATTR_NET_PEER_PORT = 'net.peer.port' as const;

/**
 * Deprecated, use `network.transport`.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `network.transport`.
 */
export const ATTR_NET_TRANSPORT = 'net.transport' as const;

/**
 * Enum value "ip_tcp" for attribute {@link ATTR_NET_TRANSPORT}.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const NET_TRANSPORT_VALUE_IP_TCP = 'ip_tcp' as const;

/**
 * Enum value "pipe" for attribute {@link ATTR_NET_TRANSPORT}.
 *
 * Named or anonymous pipe.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const NET_TRANSPORT_VALUE_PIPE = 'pipe' as const;
