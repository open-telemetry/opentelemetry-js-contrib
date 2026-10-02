/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface NormalizedOptions {
  host?: string;
  port?: number;
  path?: string;
}

export enum SocketEvent {
  CLOSE = 'close',
  CONNECT = 'connect',
  ERROR = 'error',
  SECURE_CONNECT = 'secureConnect',
}
