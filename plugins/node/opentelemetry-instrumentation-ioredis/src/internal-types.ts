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
import type { Command, Redis } from 'ioredis';
import type * as LegacyIORedis from 'ioredis4';

interface LegacyIORedisCommand {
  reject: (err: Error) => void;
  resolve: (result: {}) => void;
  promise: Promise<{}>;
  args: Array<string | Buffer | number>;
  callback: LegacyIORedis.CallbackFunction<unknown>;
  name: string;
}

export type IORedisCommand = Command | LegacyIORedisCommand;
export type RedisInterface = Redis | LegacyIORedis.Redis;
