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
import * as utils from '../src/utils';
import * as assert from 'assert';
import * as mysqlTypes from 'mysql';

describe('utils.ts', () => {
  describe('getPoolName()', () => {
    let pool: mysqlTypes.Pool;

    it('return the pool name', () => {
      pool = mysqlTypes.createPool({
        port: 33306,
        user: 'otel',
        host: '127.0.0.1',
        password: 'secret',
        database: 'test_db',
      });

      assert.strictEqual(
        utils.getPoolName(pool),
        'host: 127.0.0.1 port: 33306 database: test_db user: otel'
      );
    });

    it('trim the pool name in case there is no user', () => {
      pool = mysqlTypes.createPool({
        port: 33306,
        host: '127.0.0.1',
        password: 'secret',
        database: 'test_db',
      });

      assert.strictEqual(
        utils.getPoolName(pool),
        'host: 127.0.0.1 port: 33306 database: test_db'
      );
    });
  });
});
