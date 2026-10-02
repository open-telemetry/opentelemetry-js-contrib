/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';

/**
 * Function that can be used to serialize the db.query.text attribute
 * @param cmdName - The name of the command (eg. set, get, mset)
 * @param cmdArgs - Array of arguments passed to the command
 *
 * @returns serialized string that will be used as the db.query.text attribute.
 */
export type DbStatementSerializer = (
  cmdName: string,
  cmdArgs: Array<string | Buffer>
) => string;

/**
 * Function that can be used to mask the db.query.text attribute before it is
 * set on the span.
 * @param statement - The serialized statement, as produced by the
 *  {@link DbStatementSerializer}
 *
 * @returns the string that will be used as the db.query.text attribute.
 */
export type DbStatementMaskingHook = (statement: string) => string;

/**
 * Function that can be used to add custom attributes to span on response from redis server
 * @param span - The span created for the redis command, on which attributes can be set
 * @param cmdName - The name of the command (eg. set, get, mset)
 * @param cmdArgs - Array of arguments passed to the command
 * @param response - The response object which is returned to the user who called this command.
 *  Can be used to set custom attributes on the span.
 *  The type of the response varies depending on the specific command.
 */
export interface RedisResponseCustomAttributeFunction {
  (
    span: Span,
    cmdName: string,
    cmdArgs: Array<string | Buffer>,
    response: unknown
  ): void;
}

export interface RedisInstrumentationConfig extends InstrumentationConfig {
  /** Custom serializer function for the db.query.text attribute */
  dbStatementSerializer?: DbStatementSerializer;

  /**
   * If true, commands that accept only keys, hash fields, patterns, numbers or
   * fixed tokens also serialize their arguments, and the resulting statement is
   * masked using {@link maskStatementHook}.
   *
   * Without it those commands are serialized as `HGETALL [1 other arguments]`,
   * so every invocation looks the same. With it they become
   * `HGETALL player:?:stats`, which identifies the key pattern without
   * recording which entity was touched.
   *
   * Commands that accept values, such as `SET`, `HSET` and `EVAL`, are not
   * affected, and their values stay redacted either way.
   *
   * @default false
   * @see maskStatementHook
   */
  serializeKeys?: boolean;

  /**
   * Hook that masks the statement when {@link serializeKeys} is true. Ignored
   * otherwise.
   *
   * Pass `statement => statement` to record keys without masking them.
   *
   * @default defaultDbStatementMaskingHook, which replaces identifier shaped
   *  key segments with '?'
   */
  maskStatementHook?: DbStatementMaskingHook;

  /** Function for adding custom attributes on db response */
  responseHook?: RedisResponseCustomAttributeFunction;

  /** Require parent to create redis span, default when unset is false */
  requireParentSpan?: boolean;
}
