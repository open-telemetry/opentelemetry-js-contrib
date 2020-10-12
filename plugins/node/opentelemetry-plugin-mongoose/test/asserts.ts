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
import * as assert from 'assert';
import { ReadableSpan } from '@opentelemetry/tracing';
import { AttributeNames } from '../src/enums';

export function assertSpan(span: ReadableSpan) {
  assert.strictEqual(span.attributes[AttributeNames.COMPONENT], 'mongoose');
  assert.strictEqual(span.attributes[AttributeNames.DB_TYPE], 'nosql');

  assert.strictEqual(span.attributes[AttributeNames.DB_HOST], 'localhost');
  assert.strictEqual(span.attributes[AttributeNames.DB_PORT], 27017);
  assert.strictEqual(span.attributes[AttributeNames.DB_USER], undefined);
}
