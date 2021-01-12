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

import type * as ioredisTypes from 'ioredis';
import { Tracer, SpanKind, Span, StatusCode } from '@opentelemetry/api';
import {
  IoredisCommand,
  IORedisInstrumentationConfig,
  DbStatementSerializer,
} from './types';
import { IORedisInstrumentation } from './ioredis';
import {
  DatabaseAttribute,
  GeneralAttribute,
} from '@opentelemetry/semantic-conventions';

const endSpan = (span: Span, err: NodeJS.ErrnoException | null | undefined) => {
  if (err) {
    span.setStatus({
      code: StatusCode.ERROR,
      message: err.message,
    });
  }
  span.end();
};

export const traceConnection = (tracer: Tracer, original: Function) => {
  return function (this: ioredisTypes.Redis) {
    const span = tracer.startSpan('connect', {
      kind: SpanKind.CLIENT,
      attributes: {
        [DatabaseAttribute.DB_SYSTEM]: IORedisInstrumentation.DB_SYSTEM,
        [DatabaseAttribute.DB_STATEMENT]: 'connect',
      },
    });
    const { host, port } = this.options;

    span.setAttributes({
      [GeneralAttribute.NET_PEER_NAME]: host,
      [GeneralAttribute.NET_PEER_PORT]: port,
      [GeneralAttribute.NET_PEER_ADDRESS]: `redis://${host}:${port}`,
    });
    try {
      const client = original.apply(this, arguments);
      endSpan(span, null);
      return client;
    } catch (error) {
      endSpan(span, error);
      throw error;
    }
  };
};

const defaultDbStatementSerializer: DbStatementSerializer = (
  cmdName,
  cmdArgs
) =>
  Array.isArray(cmdArgs) && cmdArgs.length
    ? `${cmdName} ${cmdArgs.join(' ')}`
    : cmdName;

export const traceSendCommand = (
  tracer: Tracer,
  original: Function,
  config?: IORedisInstrumentationConfig
) => {
  const dbStatementSerializer =
    config?.dbStatementSerializer || defaultDbStatementSerializer;
  return function (this: ioredisTypes.Redis, cmd?: IoredisCommand) {
    if (arguments.length < 1 || typeof cmd !== 'object') {
      return original.apply(this, arguments);
    }
    // Do not trace if there is not parent span
    if (tracer.getCurrentSpan() === undefined) {
      return original.apply(this, arguments);
    }

    const span = tracer.startSpan(cmd.name, {
      kind: SpanKind.CLIENT,
      attributes: {
        [DatabaseAttribute.DB_SYSTEM]: IORedisInstrumentation.DB_SYSTEM,
        [DatabaseAttribute.DB_STATEMENT]: dbStatementSerializer(
          cmd.name,
          cmd.args
        ),
      },
    });

    const { host, port } = this.options;

    span.setAttributes({
      [GeneralAttribute.NET_PEER_NAME]: host,
      [GeneralAttribute.NET_PEER_PORT]: port,
      [GeneralAttribute.NET_PEER_ADDRESS]: `redis://${host}:${port}`,
    });

    try {
      const result = original.apply(this, arguments);
      endSpan(span, null);
      return result;
    } catch (error) {
      endSpan(span, error);
      throw error;
    }
  };
};
