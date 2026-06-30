/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Attributes } from '@opentelemetry/api';
import {
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { DB_SYSTEM_NAME_VALUE_REDIS } from '../semconv';

export function getClientAttributes(options: any): Attributes {
  const attributes: Attributes = {};
  Object.assign(attributes, {
    [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_REDIS,
    [ATTR_SERVER_ADDRESS]: options?.socket?.host,
    [ATTR_SERVER_PORT]: options?.socket?.port,
  });

  return attributes;
}
