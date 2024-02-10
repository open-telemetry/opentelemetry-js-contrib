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

import assert = require('assert');
import { parseConnectionString } from '../src/utils';

describe('utils', () => {
  describe('parseConnectionString', () => {
    it('should return undefined if connectionString is undefined', () => {
      const connection = parseConnectionString(undefined);

      assert.strictEqual(connection, undefined);
    });

    it('should return object with connection properties', () => {
      const connection = parseConnectionString(
        'postgres://user:password@localhost:5555/mydb'
      );

      assert.deepEqual(connection, {
        host: 'localhost',
        port: 5555,
        user: 'user',
        database: 'mydb',
      });
    });

    it('should assume default port of 5432 if not provided', () => {
      const connection = parseConnectionString(
        'postgres://user@localhost/mydb'
      );

      assert.deepEqual(connection, {
        host: 'localhost',
        port: 5432,
        user: 'user',
        database: 'mydb',
      });
    });
  });
});
