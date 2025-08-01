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
import { Attributes } from '@opentelemetry/api';
import {
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';

export function getClientAttributes(options: any): Attributes {
  const attrs: Attributes = {
    [ATTR_DB_SYSTEM_NAME]: 'redis',
    [ATTR_SERVER_ADDRESS]: options?.socket?.host,
    [ATTR_SERVER_PORT]: options?.socket?.port,
  };

  return attrs;
}
