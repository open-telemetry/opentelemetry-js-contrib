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

import { Span, SpanStatusCode } from '@opentelemetry/api';
import { DbStatementSerializer } from './types';

/**
 * Map of command names to the number of arguments that should be serialized.
 * For example, SET should serialize which key it's operating on, but not its value.
 * Commands not listed will have all their arguments serialized.
 *
 * Refer to https://redis.io/commands/ for the full list.
 */
const SerializationSubsets: { [name: string]: number } = {
  APPEND: 1,
  'FUNCTION LOAD': 0,
  GETSET: 1,
  HMSET: 2,
  HSET: 2,
  HSETNX: 2,
  LINSERT: 3,
  LPUSH: 1,
  LPUSHX: 1,
  LSET: 2,

  // MSET and MSETNX have repeating argument lists, so this serialization is likely to be incomplete.
  MSET: 1,
  MSETNX: 1,

  PDFADD: 1,
  PSETEX: 2,
  PUBLISH: 1,
  RESTORE: 2,
  RPUSH: 1,
  RPUSHX: 1,
  SADD: 1,
  'SCRIPT LOAD': 0,
  SET: 1,
  SETEX: 2,
  SETNX: 1,
  SISMEMBER: 1,
  SMISMEMBER: 1,
  SPUBLISH: 1,
  XADD: 3,
  ZADD: 2,
};

export const endSpan = (
  span: Span,
  err: NodeJS.ErrnoException | null | undefined
) => {
  if (err) {
    span.recordException(err);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
  }
  span.end();
};

export const defaultDbStatementSerializer: DbStatementSerializer = (
  cmdName,
  cmdArgs
) => {
  if (Array.isArray(cmdArgs) && cmdArgs.length) {
    const argsSubset = SerializationSubsets[cmdName.toUpperCase()];
    if (argsSubset) {
      const args = cmdArgs.slice(0, argsSubset);
      const remainder = cmdArgs.slice(argsSubset);
      return `${cmdName} ${args.join(' ')} [${
        remainder.length
      } other arguments]`;
    }
    return `${cmdName} ${cmdArgs.join(' ')}`;
  }
  return cmdName;
};
