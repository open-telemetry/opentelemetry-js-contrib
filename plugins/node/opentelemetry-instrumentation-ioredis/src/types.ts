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

import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { Span } from '@opentelemetry/api';

export type CommandArgs = Array<string | Buffer | number | any[]>;

/**
 * Function that can be used to serialize db.statement tag
 * @param cmdName - The name of the command (eg. set, get, mset)
 * @param cmdArgs - Array of arguments passed to the command
 *
 * @returns serialized string that will be used as the db.statement attribute.
 */
export type DbStatementSerializer = (
  cmdName: string,
  cmdArgs: CommandArgs
) => string;

export interface IORedisRequestHookInformation {
  moduleVersion?: string;
  cmdName: string;
  cmdArgs: CommandArgs;
}

export interface RedisRequestCustomAttributeFunction {
  (span: Span, requestInfo: IORedisRequestHookInformation): void;
}

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
  (span: Span, cmdName: string, cmdArgs: CommandArgs, response: unknown): void;
}

/**
 * Options available for the IORedis Instrumentation (see [documentation](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-ioredis/README.md#ioredis-instrumentation-options))
 */
export interface IORedisInstrumentationConfig extends InstrumentationConfig {
  /** Custom serializer function for the db.statement tag */
  dbStatementSerializer?: DbStatementSerializer;

  /** Function for adding custom attributes on db request */
  requestHook?: RedisRequestCustomAttributeFunction;

  /** Function for adding custom attributes on db response */
  responseHook?: RedisResponseCustomAttributeFunction;

  /** Require parent to create ioredis span, default when unset is true */
  requireParentSpan?: boolean;
}
