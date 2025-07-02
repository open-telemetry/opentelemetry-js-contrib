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
export interface RedisPluginClientTypes {
  connection_options?: {
    port?: string;
    host?: string;
  };

  address?: string;
}

// exported from
// https://github.com/redis/node-redis/blob/v3.1.2/lib/command.js
export interface RedisCommand {
  command: string;
  args: string[];
  buffer_args: boolean;
  callback: (err: Error | null, reply: unknown) => void;
  call_on_write: boolean;
}

// Exported from "@types/redis@2.8.32".
export type Callback<T> = (err: Error | null, reply: T) => void;
