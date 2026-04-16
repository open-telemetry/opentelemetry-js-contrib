/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Attributes, DiagLogger } from '@opentelemetry/api';
import {
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_DB_SYSTEM,
  ATTR_DB_CONNECTION_STRING,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  DB_SYSTEM_VALUE_REDIS,
  DB_SYSTEM_NAME_VALUE_REDIS,
} from '../semconv';
import { SemconvStability } from '@opentelemetry/instrumentation';

export function getClientAttributes(
  diag: DiagLogger,
  options: any,
  semconvStability: SemconvStability
): Attributes {
  const attributes: Attributes = {};

  if (semconvStability & SemconvStability.OLD) {
    Object.assign(attributes, {
      [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
      [ATTR_NET_PEER_NAME]: options?.socket?.host,
      [ATTR_NET_PEER_PORT]: options?.socket?.port,
      [ATTR_DB_CONNECTION_STRING]:
        removeCredentialsFromDBConnectionStringAttribute(diag, options?.url),
    });
  }

  if (semconvStability & SemconvStability.STABLE) {
    Object.assign(attributes, {
      [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_REDIS,
      [ATTR_SERVER_ADDRESS]: options?.socket?.host,
      [ATTR_SERVER_PORT]: options?.socket?.port,
    });
  }

  return attributes;
}

/**
 * removeCredentialsFromDBConnectionStringAttribute removes basic auth from url and user_pwd from query string
 *
 * Examples:
 *   redis://user:pass@localhost:6379/mydb => redis://localhost:6379/mydb
 *   redis://localhost:6379?db=mydb&user_pwd=pass => redis://localhost:6379?db=mydb
 */
function removeCredentialsFromDBConnectionStringAttribute(
  diag: DiagLogger,
  url?: unknown
): string | undefined {
  if (typeof url !== 'string' || !url) {
    return;
  }

  try {
    const u = new URL(url);
    u.searchParams.delete('user_pwd');
    u.username = '';
    u.password = '';
    return u.href;
  } catch (err) {
    diag.error('failed to sanitize redis connection url', err);
  }
  return;
}
