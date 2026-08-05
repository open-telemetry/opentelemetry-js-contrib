/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
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
