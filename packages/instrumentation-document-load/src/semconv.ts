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
 * Deprecated, use `http.response.header.content-length` instead.
 *
 * @example 3495
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `http.response.header.content-length`.
 */
export const ATTR_HTTP_RESPONSE_CONTENT_LENGTH =
  'http.response_content_length' as const;

/**
 * Deprecated, use `url.full` instead.
 *
 * @example https://www.foo.bar/search?q=OpenTelemetry#SemConv
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `url.full`.
 */
export const ATTR_HTTP_URL = 'http.url' as const;

/**
 * Deprecated, use `user_agent.original` instead.
 *
 * @example CERN-LineMode/2.15 libwww/2.17b3
 * @example Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `user_agent.original`.
 */
export const ATTR_HTTP_USER_AGENT = 'http.user_agent' as const;
