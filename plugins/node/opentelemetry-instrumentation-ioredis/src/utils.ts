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
import {
  Tracer,
  SpanKind,
  Span,
  SpanStatusCode,
  getSpan,
  context,
  diag,
} from '@opentelemetry/api';
import {
  IORedisCommand,
  IORedisInstrumentationConfig,
  DbStatementSerializer,
} from './types';
import { IORedisInstrumentation } from './ioredis';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';

const endSpan = (span: Span, err: NodeJS.ErrnoException | null | undefined) => {
  if (err) {
    span.recordException(err);
    span.setStatus({
      code: SpanStatusCode.ERROR,
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
        [SemanticAttributes.DB_SYSTEM]: IORedisInstrumentation.DB_SYSTEM,
        [SemanticAttributes.DB_STATEMENT]: 'connect',
      },
    });
    const { host, port } = this.options;

    span.setAttributes({
      [SemanticAttributes.NET_PEER_NAME]: host,
      [SemanticAttributes.NET_PEER_PORT]: port,
      [SemanticAttributes.NET_PEER_IP]: `redis://${host}:${port}`,
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
  config?: IORedisInstrumentationConfig,
  moduleVersion?: string
) => {
  const dbStatementSerializer =
    config?.dbStatementSerializer || defaultDbStatementSerializer;
  return function (this: ioredisTypes.Redis, cmd?: IORedisCommand) {
    if (arguments.length < 1 || typeof cmd !== 'object') {
      return original.apply(this, arguments);
    }

    const hasNoParentSpan = getSpan(context.active()) === undefined;
    if (config?.requireParentSpan === true && hasNoParentSpan) {
      return original.apply(this, arguments);
    }

    const span = tracer.startSpan(cmd.name, {
      kind: SpanKind.CLIENT,
      attributes: {
        [SemanticAttributes.DB_SYSTEM]: IORedisInstrumentation.DB_SYSTEM,
        [SemanticAttributes.DB_STATEMENT]: dbStatementSerializer(
          cmd.name,
          cmd.args
        ),
      },
    });

    if (config?.requestHook) {
      safeExecuteInTheMiddle(
        () =>
          config?.requestHook!(span, {
            moduleVersion,
            cmdName: cmd.name,
            cmdArgs: cmd.args,
          }),
        e => {
          if (e) {
            diag.error('ioredis instrumentation: request hook failed', e);
          }
        },
        true
      );
    }

    const { host, port } = this.options;

    span.setAttributes({
      [SemanticAttributes.NET_PEER_NAME]: host,
      [SemanticAttributes.NET_PEER_PORT]: port,
      [SemanticAttributes.NET_PEER_IP]: `redis://${host}:${port}`,
    });

    try {
      const result = original.apply(this, arguments);

      const origResolve = cmd.resolve;
      /* eslint-disable @typescript-eslint/no-explicit-any */
      cmd.resolve = function (result: any) {
        safeExecuteInTheMiddle(
          () => config?.responseHook?.(span, cmd.name, cmd.args, result),
          e => {
            if (e) {
              diag.error('ioredis instrumentation: response hook failed', e);
            }
          },
          true
        );

        endSpan(span, null);
        origResolve(result);
      };

      const origReject = cmd.reject;
      cmd.reject = function (err: Error) {
        endSpan(span, err);
        origReject(err);
      };

      return result;
    } catch (error) {
      endSpan(span, error);
      throw error;
    }
  };
};
