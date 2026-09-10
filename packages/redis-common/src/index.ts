/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * List of regexes and the number of arguments that should be serialized for matching commands.
 * For example, HSET should serialize which key and field it's operating on, but not its value.
 * Setting the subset to -1 will serialize all arguments.
 * Commands without a match will have none of their arguments serialized.
 *
 * Refer to https://redis.io/commands/ for the full list.
 */
const serializationSubsets = [
  {
    regex: /^ECHO/i,
    args: 0,
  },
  {
    regex:
      /^(GETSET|LPUSH|MSET|PFA|PSETEX|PUBLISH|RPUSH|SADD|SET|SPUBLISH|XADD|ZADD)/i,
    args: 1,
  },
  {
    regex: /^(HSET|HMSET|LSET|LINSERT)/i,
    args: 2,
  },
  // ACL and CONFIG subcommands may contain sensitive data (e.g. passwords),
  // so only serialize the subcommand name (first argument).
  {
    regex: /^(ACL|CONFIG)/i,
    args: 1,
  },
  {
    regex:
      /^(BIT|B[LRZ]|CLIENT|CLUSTER|COMMAND|DECR|DEL|EVAL|EX|FUNCTION|GEO|GET|HINCR|HMGET|HSCAN|INCR|L[TRLM]|MEMORY|P[EFISTU]|RPOP|S[CDIMORSU]|XACK|X[CDGILPRT]|Z[CDILMPRS])/i,
    args: -1,
  },
];

export type DbStatementSerializer = (
  cmdName: string,
  cmdArgs: Array<string | Buffer | number | any[]>
) => string;

/**
 * Additional subsets consulted only when the `serializeKeys` option is enabled.
 *
 * Every argument of these commands is a key, hash field, pattern, number or
 * fixed token, so serializing them cannot expose a stored value. They are kept
 * out of the default because emitting the key turns `db.query.text` into a high
 * cardinality attribute for commands that currently produce a constant string,
 * which would change the shape and cost of existing metrics and dashboards.
 *
 * These regexes must not overlap with `serializationSubsets`, so that enabling
 * the option can never widen a command whose arguments carry caller data.
 */
const keySerializationSubsets = [
  {
    regex:
      /^(BGSAVE|COPY|DUMP|FLUSH|HDEL|HEXISTS|HGET|HKEYS|HLEN|HRANDFIELD|HSTRLEN|HVALS|KEYS|LCS|LINDEX|LOLWUT|LPOP|MGET|MOVE|RENAME|SELECT|SHUTDOWN|SPOP|STRLEN|SWAPDB|TOUCH|TTL|TYPE|UNLINK|WAIT|WATCH|ZUNION)/i,
    args: -1,
  },
];

export interface DbStatementSerializerOptions {
  /**
   * Serialize the arguments of commands that accept only keys, hash fields,
   * patterns, numbers or fixed tokens, such as `HGETALL`, `TTL` and `MGET`.
   * Without it those commands are serialized as `HGETALL [1 other arguments]`,
   * which makes every invocation indistinguishable.
   *
   * No stored value can be exposed by this option, but the resulting
   * `db.query.text` is high cardinality unless it is also masked, so it
   * defaults to `false`.
   *
   * @default false
   */
  serializeKeys?: boolean;
}

/**
 * Builds a serializer that combines the command name with the arguments allowed
 * by `serializationSubsets`, and by `keySerializationSubsets` when the
 * `serializeKeys` option is enabled.
 *
 * @param options see {@link DbStatementSerializerOptions}
 * @returns a `DbStatementSerializer` honouring `options`
 */
export const createDbStatementSerializer = (
  options: DbStatementSerializerOptions = {}
): DbStatementSerializer => {
  const subsets = options.serializeKeys
    ? [...serializationSubsets, ...keySerializationSubsets]
    : serializationSubsets;

  return (cmdName, cmdArgs) => {
    if (Array.isArray(cmdArgs) && cmdArgs.length) {
      const nArgsToSerialize =
        subsets.find(({ regex }) => {
          return regex.test(cmdName);
        })?.args ?? 0;
      const argsToSerialize =
        nArgsToSerialize >= 0 ? cmdArgs.slice(0, nArgsToSerialize) : cmdArgs;
      if (cmdArgs.length > argsToSerialize.length) {
        argsToSerialize.push(
          `[${cmdArgs.length - nArgsToSerialize} other arguments]`
        );
      }
      return `${cmdName} ${argsToSerialize.join(' ')}`;
    }
    return cmdName;
  };
};

/**
 * Given the redis command name and arguments, return a combination of the
 * command name + the allowed arguments according to `serializationSubsets`.
 * @param cmdName The redis command name
 * @param cmdArgs The redis command arguments
 * @returns a combination of the command name + args according to `serializationSubsets`.
 */
export const defaultDbStatementSerializer: DbStatementSerializer =
  createDbStatementSerializer();

export type DbStatementMaskingHook = (statement: string) => string;

const MASK = '?';

/**
 * Trailing redaction placeholder produced by the serializer, for example the
 * `[2 other arguments]` in `SET key [2 other arguments]`. It is generated text
 * rather than caller input, so masking must leave it alone.
 */
const REDACTION_PLACEHOLDER = /\s\[\d+ other arguments\]$/;

/**
 * Redis cluster hash tag, the `{1234}` in `user:{1234}:profile`. The braces are
 * meaningful to redis, so only their contents are considered for masking.
 */
const HASH_TAG = /^\{(.*)\}$/;

/**
 * Shapes that identify a single entity, and so make a key unique per user,
 * session or request. These are what turn `db.query.text` into a high
 * cardinality attribute.
 */
const IDENTIFIER_SHAPES = [
  /^\d+$/, // 42
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // uuid
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // alice@example.com
  /^[0-9a-f]{8,}$/i, // hex digest, or a uuid without dashes
  /^[0-9A-HJKMNP-TV-Z]{26}$/, // ulid
  /^(?=.*\d)[A-Za-z0-9_-]{16,}$/, // nanoid, base64url and similar opaque tokens
];

const isIdentifier = (segment: string): boolean =>
  IDENTIFIER_SHAPES.some(shape => shape.test(segment));

const maskSegment = (segment: string): string => {
  const hashTag = HASH_TAG.exec(segment);
  if (hashTag) {
    return `{${isIdentifier(hashTag[1]) ? MASK : hashTag[1]}}`;
  }
  return isIdentifier(segment) ? MASK : segment;
};

/**
 * Masks the parts of a serialized statement that identify a single entity,
 * keeping the parts that describe which access pattern was used.
 *
 * Redis keys are conventionally colon delimited, so each argument is split on
 * `:` and every segment that looks like an identifier is replaced with `?`.
 * `HGETALL player:1261821:stats` becomes `HGETALL player:?:stats`, so the shape
 * of the key survives while the identity does not.
 *
 * The command name and the redaction placeholder are never masked, and
 * segments that are not identifier shaped, such as `queue:high` or
 * `feature_flags`, are left as they are.
 *
 * @param statement a statement produced by a `DbStatementSerializer`
 * @returns the statement with identifier shaped segments replaced by `?`
 */
export const defaultDbStatementMaskingHook: DbStatementMaskingHook =
  statement => {
    const placeholder = REDACTION_PLACEHOLDER.exec(statement);
    const head = placeholder
      ? statement.slice(0, placeholder.index)
      : statement;

    const masked = head
      .split(' ')
      // the first token is the command name, which is never caller data
      .map((token, i) =>
        i === 0 ? token : token.split(':').map(maskSegment).join(':')
      )
      .join(' ');

    return placeholder ? `${masked}${placeholder[0]}` : masked;
  };
