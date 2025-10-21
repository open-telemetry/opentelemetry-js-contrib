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
