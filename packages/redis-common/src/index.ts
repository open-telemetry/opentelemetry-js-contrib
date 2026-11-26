/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * List of regexes and the number of arguments that should be serialized for matching commands.
 * For example, HSET should serialize which key and field it's operating on, but not its value.
 * Setting the subset to -1 will serialize all arguments.
 * Commands without a match will have their first argument serialized.
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
 * Given the redis command name and arguments, return a combination of the
 * command name + the allowed arguments according to `serializationSubsets`.
 * @param cmdName The redis command name
 * @param cmdArgs The redis command arguments
 * @returns a combination of the command name + args according to `serializationSubsets`.
 */
export const defaultDbStatementSerializer: DbStatementSerializer = (
  cmdName,
  cmdArgs
) => {
  if (Array.isArray(cmdArgs) && cmdArgs.length) {
    const nArgsToSerialize =
      serializationSubsets.find(({ regex }) => {
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
