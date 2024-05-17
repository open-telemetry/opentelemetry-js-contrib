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

import type * as redisTypes from 'redis';
import {
  context,
  Tracer,
  SpanKind,
  Span,
  SpanStatusCode,
  trace,
  diag,
} from '@opentelemetry/api';
import { RedisCommand, RedisInstrumentationConfig } from './types';
import { EventEmitter } from 'events';
import { RedisInstrumentation } from './';
import {
  DBSYSTEMVALUES_REDIS,
  SEMATTRS_DB_CONNECTION_STRING,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
} from '@opentelemetry/semantic-conventions';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import { RedisPluginClientTypes } from './internal-types';
import { defaultDbStatementSerializer } from '@opentelemetry/redis-common';

const endSpan = (span: Span, err?: Error | null) => {
  if (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
  }
  span.end();
};

export const getTracedCreateClient = (tracer: Tracer, original: Function) => {
  return function createClientTrace(this: redisTypes.RedisClient) {
    const client: redisTypes.RedisClient = original.apply(this, arguments);
    return context.bind(context.active(), client);
  };
};

export const getTracedCreateStreamTrace = (
  tracer: Tracer,
  original: Function
) => {
  return function create_stream_trace(this: redisTypes.RedisClient) {
    if (!Object.prototype.hasOwnProperty.call(this, 'stream')) {
      Object.defineProperty(this, 'stream', {
        get() {
          return this._patched_redis_stream;
        },
        set(val: EventEmitter) {
          context.bind(context.active(), val);
          this._patched_redis_stream = val;
        },
      });
    }
    return original.apply(this, arguments);
  };
};

export const getTracedInternalSendCommand = (
  tracer: Tracer,
  original: Function,
  config?: RedisInstrumentationConfig
) => {
  return function internal_send_command_trace(
    this: RedisPluginClientTypes,
    cmd?: RedisCommand
  ) {
    // New versions of redis (2.4+) use a single options object
    // instead of named arguments
    if (arguments.length !== 1 || typeof cmd !== 'object') {
      // We don't know how to trace this call, so don't start/stop a span
      return original.apply(this, arguments);
    }

    const hasNoParentSpan = trace.getSpan(context.active()) === undefined;
    if (config?.requireParentSpan === true && hasNoParentSpan) {
      return original.apply(this, arguments);
    }

    const dbStatementSerializer =
      config?.dbStatementSerializer || defaultDbStatementSerializer;
    const span = tracer.startSpan(
      `${RedisInstrumentation.COMPONENT}-${cmd.command}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_REDIS,
          [SEMATTRS_DB_STATEMENT]: dbStatementSerializer(cmd.command, cmd.args),
        },
      }
    );

    // Set attributes for not explicitly typed RedisPluginClientTypes
    if (this.connection_options) {
      span.setAttributes({
        [SEMATTRS_NET_PEER_NAME]: this.connection_options.host,
        [SEMATTRS_NET_PEER_PORT]: this.connection_options.port,
      });
    }
    if (this.address) {
      span.setAttribute(
        SEMATTRS_DB_CONNECTION_STRING,
        `redis://${this.address}`
      );
    }

    const originalCallback = arguments[0].callback;
    if (originalCallback) {
      const originalContext = context.active();
      (arguments[0] as RedisCommand).callback = function callback<T>(
        this: unknown,
        err: Error | null,
        reply: T
      ) {
        if (config?.responseHook) {
          const responseHook = config.responseHook;
          safeExecuteInTheMiddle(
            () => {
              responseHook(span, cmd.command, cmd.args, reply);
            },
            err => {
              if (err) {
                diag.error('Error executing responseHook', err);
              }
            },
            true
          );
        }

        endSpan(span, err);
        return context.with(
          originalContext,
          originalCallback,
          this,
          ...arguments
        );
      };
    }
    try {
      // Span will be ended in callback
      return original.apply(this, arguments);
    } catch (rethrow: any) {
      endSpan(span, rethrow);
      throw rethrow; // rethrow after ending span
    }
  };
};
