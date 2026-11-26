/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Error class introduced in redis@4.6.12.
// https://github.com/redis/node-redis/blob/redis@4.6.12/packages/client/lib/errors.ts#L69-L84
export interface MultiErrorReply extends Error {
  replies: unknown[];
  errorIndexes: Array<number>;
}
