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
  describe('getDbQueryText()', () => {
    it('should return raw query when maskStatement is false', () => {
      const query = "SELECT * FROM users WHERE email = 'test@example.com'";
      const result = utils.getDbQueryText(query, false);
      assert.strictEqual(result, query);
    });

    it('should return raw query when maskStatement is not provided', () => {
      const query = "SELECT * FROM users WHERE email = 'test@example.com'";
      const result = utils.getDbQueryText(query);
      assert.strictEqual(result, query);
    });

    it('should mask query when maskStatement is true', () => {
      const query = "SELECT * FROM users WHERE email = 'test@example.com'";
      const result = utils.getDbQueryText(query, true);
      assert.strictEqual(result, 'SELECT * FROM users WHERE email = ?');
    });

    it('should mask numeric literals', () => {
      const query = 'SELECT * FROM users WHERE id = 123';
      const result = utils.getDbQueryText(query, true);
      assert.strictEqual(result, 'SELECT * FROM users WHERE id = ?');
    });

    it('should mask double-quoted strings', () => {
      const query = 'SELECT * FROM users WHERE name = "John Doe"';
      const result = utils.getDbQueryText(query, true);
      assert.strictEqual(result, 'SELECT * FROM users WHERE name = ?');
    });

    it('should handle escaped quotes inside strings', () => {
      const query = "SELECT * FROM users WHERE name = 'O\\'Brien'";
      const result = utils.getDbQueryText(query, true);
      assert.strictEqual(result, 'SELECT * FROM users WHERE name = ?');
    });

    it('should mask multiple values', () => {
      const query =
        "INSERT INTO users (id, name, email) VALUES (123, 'John', 'john@example.com')";
      const result = utils.getDbQueryText(query, true);
      assert.strictEqual(
        result,
        'INSERT INTO users (id, name, email) VALUES (?, ?, ?)'
      );
    });

    it('should preserve SQL structure', () => {
      const query =
        'SELECT id, name FROM users WHERE age > 18 ORDER BY created_at';
      const result = utils.getDbQueryText(query, true);
      assert.strictEqual(
        result,
        'SELECT id, name FROM users WHERE age > ? ORDER BY created_at'
      );
    });

    it('should mask floating point numbers', () => {
      const query = 'SELECT * FROM products WHERE price > 19.99';
      // Note: The regex only matches integers with word boundaries, so 19.99 becomes ?.?
      const result = utils.getDbQueryText(query, true);
      assert.strictEqual(result, 'SELECT * FROM products WHERE price > ?.?');
    });

    it('should handle empty strings', () => {
      const query = "SELECT * FROM users WHERE name = ''";
      const result = utils.getDbQueryText(query, true);
      assert.strictEqual(result, 'SELECT * FROM users WHERE name = ?');
    });

    it('should use custom maskStatementHook when provided', () => {
      const query = 'SELECT * FROM users WHERE id = 123';
      const customHook = (q: string) => q.replace(/\d+/g, 'REDACTED');
      const result = utils.getDbQueryText(query, true, customHook);
      assert.strictEqual(result, 'SELECT * FROM users WHERE id = REDACTED');
    });

    it('should extract sql from Query object', () => {
      const query = { sql: 'SELECT * FROM users WHERE id = 123' };
      const result = utils.getDbQueryText(query, true);
      assert.strictEqual(result, 'SELECT * FROM users WHERE id = ?');
    });

    it('should extract sql from QueryOptions object', () => {
      const query = {
        sql: "SELECT * FROM users WHERE name = 'John'",
        values: ['John'],
      };
      const result = utils.getDbQueryText(query, true);
      assert.strictEqual(result, 'SELECT * FROM users WHERE name = ?');
    });

    it('should handle masking hook that throws an error', () => {
      const query = 'SELECT * FROM users';
      const throwingHook = () => {
        throw new Error('Hook failed');
      };
      const result = utils.getDbQueryText(query, true, throwingHook);
      assert.strictEqual(
        result,
        'Could not determine the query due to an error in masking'
      );
    });
  });

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
