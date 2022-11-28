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
import {
  DbSystemValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';

export function getClientAttributes(options: any) {

  let db_redis_database_index;

      //checking if database index is specified in Redis client (if not, default db_redis_database_index = 0)
  if (options?.database){
    db_redis_database_index = options?.database
  }else{
    db_redis_database_index = '0'
  }

  return {
    [SemanticAttributes.DB_SYSTEM]: DbSystemValues.REDIS,
    [SemanticAttributes.NET_PEER_NAME]: options?.socket?.host,
    [SemanticAttributes.NET_PEER_PORT]: options?.socket?.port,
    [SemanticAttributes.DB_CONNECTION_STRING]: options?.url,
    [SemanticAttributes.DB_REDIS_DATABASE_INDEX]: db_redis_database_index,
  };
}