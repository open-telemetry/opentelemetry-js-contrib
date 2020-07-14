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

import * as ioredisTypes from 'ioredis';
import { PluginConfig } from '@opentelemetry/api';

export interface IoredisCommand {
  reject: (err: Error) => void;
  resolve: (result: {}) => void;
  promise: Promise<{}>;
  args: Array<string | Buffer | number>;
  callback: ioredisTypes.CallbackFunction<unknown>;
  name: string;
}

export interface IoredisPluginClientTypes {
  // https://github.com/luin/ioredis/blob/master/API.md
  options: ioredisTypes.RedisOptions;
}

/**
 * Function that can be used to serialize db.statement tag
 * @param cmdName - The name of the command (eg. set, get, mset)
 * @param cmdArgs - Array of arguments passed to the command
 *
 * @returns serialized string that will be used as the db.statement attribute.
 */
export type DbStatementSerializer = (
  cmdName: IoredisCommand['name'],
  cmdArgs: IoredisCommand['args']
) => string;

/**
 * Options available for the IORedis Plugin (see [documentation](https://github.com/open-telemetry/opentelemetry-js/tree/master/packages/opentelemetry-plugin-ioredis#ioredis-plugin-options))
 */
export interface IoredisPluginConfig extends PluginConfig {
  /** Custom serializer function for the db.statement tag */
  dbStatementSerializer?: DbStatementSerializer;
}
