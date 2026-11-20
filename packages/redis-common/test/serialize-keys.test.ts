/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  createDbStatementSerializer,
  defaultDbStatementMaskingHook,
  defaultDbStatementSerializer,
} from '../src/index';
import * as assert from 'assert';

const withKeys = createDbStatementSerializer({ serializeKeys: true });
const masked = (cmdName: string, cmdArgs: any[]) =>
  defaultDbStatementMaskingHook(withKeys(cmdName, cmdArgs));

describe('serializeKeys', () => {
  describe('is off unless asked for', () => {
    [
      { cmdName: 'HGETALL', cmdArgs: ['user:1'] },
      { cmdName: 'TTL', cmdArgs: ['session:42'] },
      { cmdName: 'MGET', cmdArgs: ['user:1', 'user:2'] },
      { cmdName: 'KEYS', cmdArgs: ['user:*'] },
    ].forEach(({ cmdName, cmdArgs }) => {
      it(`should keep ${cmdName} redacted by default`, () => {
        assert.strictEqual(
          defaultDbStatementSerializer(cmdName, cmdArgs),
          `${cmdName} [${cmdArgs.length} other arguments]`
        );
      });
    });

    it('should not change commands that already serialize their key', () => {
      const cases: Array<[string, any[]]> = [
        ['GET', ['session:42']],
        ['SET', ['session:42', 'secret_value']],
        ['HSET', ['user:1', 'name', 'secret_value']],
        ['HMGET', ['user:1', 'name', 'email']],
        ['ACL', ['SETUSER', 'alice', '>MySecretPass']],
      ];
      for (const [cmdName, cmdArgs] of cases) {
        assert.strictEqual(
          withKeys(cmdName, cmdArgs.slice()),
          defaultDbStatementSerializer(cmdName, cmdArgs.slice()),
          `${cmdName} should be unaffected by serializeKeys`
        );
      }
    });
  });

  describe('serializes the key when enabled', () => {
    [
      { cmdName: 'HGETALL', cmdArgs: ['user:1'], expected: 'HGETALL user:1' },
      {
        cmdName: 'HGET',
        cmdArgs: ['user:1', 'name'],
        expected: 'HGET user:1 name',
      },
      { cmdName: 'TTL', cmdArgs: ['session:42'], expected: 'TTL session:42' },
      {
        cmdName: 'MGET',
        cmdArgs: ['user:1', 'user:2'],
        expected: 'MGET user:1 user:2',
      },
      { cmdName: 'KEYS', cmdArgs: ['user:*'], expected: 'KEYS user:*' },
      {
        cmdName: 'RENAMENX',
        cmdArgs: ['user:1', 'user:2'],
        expected: 'RENAMENX user:1 user:2',
      },
    ].forEach(({ cmdName, cmdArgs, expected }) => {
      it(`should serialize ${cmdName}`, () => {
        assert.strictEqual(withKeys(cmdName, cmdArgs), expected);
      });
    });

    it('should never widen a command that carries a value', () => {
      assert.strictEqual(
        withKeys('SET', ['session:42', 'secret_value']),
        'SET session:42 [1 other arguments]'
      );
      // EVAL already serializes every argument without the option, so enabling
      // it must not change the command in either direction.
      const evalArgs = ['return 1', 1, 'user:1', 'secret_arg'];
      assert.strictEqual(
        withKeys('EVAL', evalArgs.slice()),
        defaultDbStatementSerializer('EVAL', evalArgs.slice())
      );
    });
  });

  describe('masked, as the instrumentations emit it', () => {
    [
      {
        cmdName: 'HGETALL',
        cmdArgs: ['player:1261821:stats'],
        expected: 'HGETALL player:?:stats',
      },
      {
        cmdName: 'HGETALL',
        cmdArgs: ['tournament:config:0f8fad5b-d9cb-469f-a165-70867728950e'],
        expected: 'HGETALL tournament:config:?',
      },
      {
        cmdName: 'HGETALL',
        cmdArgs: ['tournament:leaderboard:sc:daily'],
        expected: 'HGETALL tournament:leaderboard:sc:daily',
      },
      {
        cmdName: 'TTL',
        cmdArgs: ['auth_revoked:1261821'],
        expected: 'TTL auth_revoked:?',
      },
      {
        cmdName: 'MGET',
        cmdArgs: ['player:1:stats', 'player:2:stats'],
        expected: 'MGET player:?:stats player:?:stats',
      },
      {
        cmdName: 'HSET',
        cmdArgs: ['player:1261821:stats', 'score', 'secret_value'],
        expected: 'HSET player:?:stats score [1 other arguments]',
      },
    ].forEach(({ cmdName, cmdArgs, expected }) => {
      it(`should emit ${expected}`, () => {
        assert.strictEqual(masked(cmdName, cmdArgs), expected);
      });
    });

    it('should collapse keys that differ only by identifier', () => {
      const statements = [1, 2, 3].map(id =>
        masked('HGETALL', [`player:${id}:stats`])
      );
      assert.strictEqual(new Set(statements).size, 1);
    });

    it('should never expose a value that the serializer redacted', () => {
      const statement = masked('SET', ['session:42', 'SECRET_VALUE']);
      assert.ok(!statement.includes('SECRET_VALUE'));
      assert.strictEqual(statement, 'SET session:? [1 other arguments]');
    });
  });
});
