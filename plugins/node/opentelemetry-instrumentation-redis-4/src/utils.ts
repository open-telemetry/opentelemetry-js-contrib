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
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_CONNECTION_STRING,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
  DBSYSTEMVALUES_REDIS,
} from '@opentelemetry/semantic-conventions';

export function getClientAttributes(
  diag: DiagLogger,
  options: any
): Attributes {
  return {
    [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_REDIS,
    [SEMATTRS_NET_PEER_NAME]: options?.socket?.host,
    [SEMATTRS_NET_PEER_PORT]: options?.socket?.port,
    [SEMATTRS_DB_CONNECTION_STRING]:
      removeCredentialsFromDBConnectionStringAttribute(diag, options?.url),
  };
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
  if (typeof url !== 'string') {
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
