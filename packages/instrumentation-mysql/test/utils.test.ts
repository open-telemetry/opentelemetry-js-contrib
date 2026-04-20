/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as utils from '../src/utils';
import * as assert from 'assert';
import * as mysqlTypes from 'mysql';

describe('utils.ts', () => {
  describe('getPoolNameOld()', () => {
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
        utils.getPoolNameOld(pool),
        "host: '127.0.0.1', port: 33306, database: 'test_db', user: 'otel'"
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
        utils.getPoolNameOld(pool),
        "host: '127.0.0.1', port: 33306, database: 'test_db'"
      );
    });
  });
});
