/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { defaultDbStatementMaskingHook } from '../src/index';
import * as assert from 'assert';

describe('#defaultDbStatementMaskingHook()', () => {
  describe('replaces segments that identify one entity', () => {
    [
      { statement: 'HGETALL user:1', expected: 'HGETALL user:?' },
      { statement: 'TTL session:42', expected: 'TTL session:?' },
      {
        statement: 'HGETALL user:0f8fad5b-d9cb-469f-a165-70867728950e:cart',
        expected: 'HGETALL user:?:cart',
      },
      {
        statement: 'GET session:550e8400e29b41d4a716446655440000',
        expected: 'GET session:?',
      },
      {
        statement: 'HGETALL user:alice@example.com',
        expected: 'HGETALL user:?',
      },
      { statement: 'GET token:V1StGXR8Z5jdHi6BmyT', expected: 'GET token:?' },
      {
        statement: 'GET event:01ARZ3NDEKTSV4RRFFQ69G5FAV',
        expected: 'GET event:?',
      },
      { statement: 'MGET user:1 user:2', expected: 'MGET user:? user:?' },
      // redis cluster hash tags keep their braces, only the contents are masked
      {
        statement: 'HGETALL user:{1234}:profile',
        expected: 'HGETALL user:{?}:profile',
      },
    ].forEach(({ statement, expected }) => {
      it(`should mask ${statement}`, () => {
        assert.strictEqual(defaultDbStatementMaskingHook(statement), expected);
      });
    });
  });

  describe('keeps the shape of the key', () => {
    [
      { statement: 'GET feature_flags', expected: 'GET feature_flags' },
      { statement: 'LLEN queue:high', expected: 'LLEN queue:high' },
      { statement: 'GET cache:v2:landing', expected: 'GET cache:v2:landing' },
      // a pattern describes a class of keys rather than one entity
      { statement: 'KEYS user:*', expected: 'KEYS user:*' },
      // hash field names are not identifiers
      { statement: 'HGET user:1 name', expected: 'HGET user:? name' },
      // the command name is never masked
      { statement: 'GET 1234', expected: 'GET ?' },
      { statement: 'PING', expected: 'PING' },
    ].forEach(({ statement, expected }) => {
      it(`should keep ${statement}`, () => {
        assert.strictEqual(defaultDbStatementMaskingHook(statement), expected);
      });
    });
  });

  describe('leaves the redaction placeholder alone', () => {
    [
      {
        statement: 'SET session:42 [1 other arguments]',
        expected: 'SET session:? [1 other arguments]',
      },
      {
        statement: 'HSET user:1 name [1 other arguments]',
        expected: 'HSET user:? name [1 other arguments]',
      },
      {
        statement: 'ACL SETUSER [6 other arguments]',
        expected: 'ACL SETUSER [6 other arguments]',
      },
      {
        statement: 'UNKNOWN [1 other arguments]',
        expected: 'UNKNOWN [1 other arguments]',
      },
    ].forEach(({ statement, expected }) => {
      it(`should not touch the placeholder in ${statement}`, () => {
        assert.strictEqual(defaultDbStatementMaskingHook(statement), expected);
      });
    });
  });
});
