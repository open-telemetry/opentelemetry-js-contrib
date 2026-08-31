/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { sanitizeSql } from '../src/index';

const sanitize = (sql: string, maxLength?: number) =>
  sanitizeSql(sql, { dialect: 'postgresql', maxLength });

const SECRETS = ['a@b.c', 'hunter2', 's3cret', '19700101'];

const assertNoSecrets = (sql: string, context = '') => {
  const sanitized = sanitize(sql);
  for (const secret of SECRETS) {
    assert.ok(
      !sanitized.includes(secret),
      `expected ${secret} to be replaced${context}, got: ${sanitized}`
    );
  }
};

/** [description, input, expected] */
type Case = [string, string, string];

const run = (cases: Case[]) => {
  for (const [description, input, expected] of cases) {
    it(description, () => {
      assert.strictEqual(sanitize(input), expected);
    });
  }
};

describe('sanitizeSql', () => {
  it('rejects an unknown dialect', () => {
    assert.throws(
      () => sanitizeSql('SELECT 1', { dialect: 'oracle' as never }),
      TypeError
    );
  });

  describe('postgresql', () => {
    describe('string literals', () => {
      run([
        [
          'replaces a quoted string',
          "SELECT * FROM users WHERE name = 'John'",
          'SELECT * FROM users WHERE name = ?',
        ],
        [
          'treats a doubled quote as an escaped quote',
          "SELECT * FROM t WHERE s = 'it''s'",
          'SELECT * FROM t WHERE s = ?',
        ],
        ['replaces an empty string', "SELECT ''", 'SELECT ?'],
        [
          'replaces a string containing a comment marker',
          "SELECT '-- not a comment'",
          'SELECT ?',
        ],
        [
          'replaces a string containing a statement separator',
          "SELECT 'a; DROP TABLE t'",
          'SELECT ?',
        ],
        [
          'replaces a string containing a placeholder',
          "SELECT 'literally $1'",
          'SELECT ?',
        ],
        [
          'replaces each of two adjacent strings',
          "SELECT 'a'\n'b'",
          'SELECT ? ?',
        ],
        [
          'replaces an unterminated string through end of input',
          "SELECT 'unterminated",
          'SELECT ?',
        ],
      ]);
    });

    describe('prefixed string literals', () => {
      run([
        [
          'honours backslash escapes in an escape string',
          "SELECT E'a\\'b', 'x'",
          'SELECT ?, ?',
        ],
        ['replaces a bit string', "SELECT B'10101'", 'SELECT ?'],
        ['replaces a hexadecimal string', "SELECT X'deadbeef'", 'SELECT ?'],
        [
          'replaces an unterminated bit string through end of input',
          "SELECT B'10101",
          'SELECT ?',
        ],
        [
          'replaces an unterminated hexadecimal string through end of input',
          "SELECT X'deadbeef",
          'SELECT ?',
        ],
        ['replaces a unicode escape string', "SELECT U&'\\0441'", 'SELECT ?'],
        [
          'does not treat a word ending in a prefix letter as a prefix',
          'SELECT Encoding, Extract FROM t',
          'SELECT Encoding, Extract FROM t',
        ],
        [
          'leaves bare prefix letters used as column names alone',
          'SELECT b, e, u, x FROM t',
          'SELECT b, e, u, x FROM t',
        ],
      ]);
    });

    describe('dollar-quoted literals', () => {
      run([
        [
          'replaces an untagged dollar-quoted string',
          "SELECT $$body with 'quotes' and ; $$",
          'SELECT ?',
        ],
        [
          'replaces a tagged dollar-quoted string',
          'SELECT $tag$ x $tag$',
          'SELECT ?',
        ],
        [
          'does not end a tagged string at a different tag',
          'SELECT $a$ $b$ $a$',
          'SELECT ?',
        ],
        ['replaces an empty dollar-quoted string', 'SELECT $$$$', 'SELECT ?'],
        [
          'replaces an unterminated dollar-quoted string through end of input',
          'SELECT $$never closed',
          'SELECT ?',
        ],
        [
          'replaces a dollar-quoted string with a non-ASCII tag',
          'SELECT $caf\u00e9$my secret note$caf\u00e9$ FROM t',
          'SELECT ? FROM t',
        ],
        [
          'replaces a dollar-quoted string opening straight after a placeholder',
          'SELECT * FROM t WHERE a = $1 AND b = $$secret$$',
          'SELECT * FROM t WHERE a = $1 AND b = ?',
        ],
      ]);
    });

    describe('parameter placeholders', () => {
      run([
        [
          'preserves a placeholder',
          'SELECT * FROM users WHERE name = $1',
          'SELECT * FROM users WHERE name = $1',
        ],
        ['preserves a multi-digit placeholder', 'SELECT $42', 'SELECT $42'],
        [
          'preserves several placeholders',
          'INSERT INTO t (a,b) VALUES ($1,$2) RETURNING id',
          'INSERT INTO t (a,b) VALUES ($1,$2) RETURNING id',
        ],
        [
          'preserves a cast placeholder',
          'SELECT x::text FROM t WHERE y = $1::uuid',
          'SELECT x::text FROM t WHERE y = $1::uuid',
        ],
        [
          'replaces literals alongside a placeholder',
          "SELECT * FROM t WHERE a = $1 AND b = 'secret'",
          'SELECT * FROM t WHERE a = $1 AND b = ?',
        ],
        [
          'treats a dollar inside a word as part of the identifier',
          'SELECT a$1 FROM t',
          'SELECT a$1 FROM t',
        ],
        [
          'treats doubled dollars inside a word as part of the identifier',
          "SELECT a$$b FROM t WHERE email = 'a@b.c'",
          'SELECT a$$b FROM t WHERE email = ?',
        ],
      ]);
    });

    describe('identifiers', () => {
      run([
        [
          'preserves a quoted identifier',
          'SELECT * FROM "MyTable" WHERE "colA" = $1',
          'SELECT * FROM "MyTable" WHERE "colA" = $1',
        ],
        [
          'preserves a doubled quote inside a quoted identifier',
          'SELECT "weird""quoted" FROM t',
          'SELECT "weird""quoted" FROM t',
        ],
        [
          'preserves a quoted identifier containing a space',
          'SELECT "has a space" FROM t',
          'SELECT "has a space" FROM t',
        ],
        ['preserves case', 'SeLeCt A FROM T', 'SeLeCt A FROM T'],
        [
          'preserves digits that continue an identifier',
          'SELECT t2.c3 FROM user2',
          'SELECT t2.c3 FROM user2',
        ],
        [
          'preserves a non-ASCII identifier',
          'SELECT caf\u00e9 FROM \u0442\u0430\u0431\u043b\u0438\u0446\u0430',
          'SELECT caf\u00e9 FROM \u0442\u0430\u0431\u043b\u0438\u0446\u0430',
        ],
        [
          'replaces an unterminated identifier through end of input',
          'SELECT * FROM "never closed',
          'SELECT * FROM ?',
        ],
        [
          'does not keep literals trailing an unbalanced quote',
          'SELECT * FROM "us"er" WHERE ssn = 123456789 AND pw = \'hunter2\'',
          'SELECT * FROM "us"er?',
        ],
      ]);
    });

    describe('comments', () => {
      run([
        [
          'drops a line comment at end of input',
          "UPDATE t SET c='a' -- note 'x'",
          'UPDATE t SET c=?',
        ],
        [
          'drops a line comment in the middle of a statement',
          'SELECT 1 -- secret\nFROM t',
          'SELECT ? FROM t',
        ],
        ['drops a block comment', 'SELECT /* hi */ 1', 'SELECT ?'],
        [
          'tracks nested block comments',
          '/* outer /* inner */ still */ SELECT 1',
          'SELECT ?',
        ],
        [
          'drops an unterminated block comment',
          'SELECT /* never closed',
          'SELECT',
        ],
        ['drops a comment-only statement', '/* only a comment */', ''],
        [
          'ends a line comment at a carriage return',
          'SELECT 1 -- secret\rFROM t WHERE a = 2',
          'SELECT ? FROM t WHERE a = ?',
        ],
      ]);
    });

    describe('numeric literals', () => {
      run([
        ['replaces an integer', 'SELECT 42', 'SELECT ?'],
        ['replaces a zero at end of input', 'SELECT 0', 'SELECT ?'],
        ['replaces a decimal', 'SELECT 3.14', 'SELECT ?'],
        ['replaces a leading-dot decimal', 'SELECT .5', 'SELECT ?'],
        [
          'replaces a signed leading-dot decimal',
          'SELECT * FROM t WHERE r = -.5',
          'SELECT * FROM t WHERE r = ?',
        ],
        ['replaces an exponent', 'SELECT 1.5e-3, 1E10', 'SELECT ?, ?'],
        [
          'replaces digit group separators in an exponent',
          'SELECT 1e123_456',
          'SELECT ?',
        ],
        ['replaces hexadecimal', 'SELECT 0x1F, 0XFF', 'SELECT ?, ?'],
        ['replaces octal and binary', 'SELECT 0o17, 0b1010', 'SELECT ?, ?'],
        ['replaces digit group separators', 'SELECT 1_000_000', 'SELECT ?'],
        [
          'absorbs a sign where a value is expected',
          'SELECT * FROM t WHERE id = -12 AND n = +7',
          'SELECT * FROM t WHERE id = ? AND n = ?',
        ],
        [
          'keeps a sign that is an operator',
          'UPDATE t SET amount = amount-1',
          'UPDATE t SET amount = amount-?',
        ],
        ['keeps an operator between two literals', 'SELECT 1-1', 'SELECT ?-?'],
        [
          'stops a number at the first non-digit',
          'SELECT 1abc FROM t',
          'SELECT ?abc FROM t',
        ],
        [
          'absorbs a sign following an operator spelled with a question mark',
          'SELECT * FROM t WHERE data ? -1',
          'SELECT * FROM t WHERE data ? ?',
        ],
      ]);
    });

    describe('structure', () => {
      run([
        [
          'does not collapse an IN list',
          'SELECT * FROM t WHERE id IN (1,2,3,4)',
          'SELECT * FROM t WHERE id IN (?,?,?,?)',
        ],
        [
          'preserves array and cast syntax',
          "SELECT ARRAY[1,2,3], '{a,b}'::text[]",
          'SELECT ARRAY[?,?,?], ?::text[]',
        ],
        [
          'preserves function calls',
          "SELECT count(*) FROM t WHERE ts > now() - interval '1 day'",
          'SELECT count(*) FROM t WHERE ts > now() - interval ?',
        ],
        [
          'preserves a jsonb existence operator',
          "SELECT * FROM t WHERE data ? 'k'",
          'SELECT * FROM t WHERE data ? ?',
        ],
        ['preserves a trailing semicolon', 'SELECT 1;', 'SELECT ?;'],
      ]);
    });

    describe('whitespace', () => {
      run([
        [
          'collapses runs of whitespace',
          'select\n  *\nfrom\n  t -- trailing\n',
          'select * from t',
        ],
        [
          'collapses tabs and carriage returns',
          'SELECT\t1\r\nFROM t',
          'SELECT ? FROM t',
        ],
        ['returns an empty string for empty input', '', ''],
        ['returns an empty string for whitespace-only input', '   \n\t ', ''],
      ]);
    });

    describe('truncation', () => {
      it('caps output at the default length', () => {
        const sanitized = sanitize('SELECT ' + "'x',".repeat(40000));
        assert.ok(
          sanitized.length <= 32 * 1024,
          `expected <= 32768, got ${sanitized.length}`
        );
      });

      it('caps output at an explicit length, at a token boundary', () => {
        assert.strictEqual(
          sanitize('SELECT a, b, c, d, e, f FROM t', 20),
          'SELECT a, b, c, d, e'
        );
      });

      it('drops a token that does not fit rather than splitting it', () => {
        assert.strictEqual(
          sanitize("SELECT * FROM verylongtable WHERE a = 'x'", 10),
          'SELECT *'
        );
      });

      it('falls back to the default for a limit that cannot bound anything', () => {
        for (const maxLength of [NaN, 0, -5, Infinity]) {
          assert.strictEqual(
            sanitize("SELECT a, b FROM t WHERE c = 'x'", maxLength),
            'SELECT a, b FROM t WHERE c = ?',
            `expected maxLength ${maxLength} to fall back to the default`
          );
        }
      });
    });

    describe('termination', () => {
      // A hand-written lexer's worst failure is a scan helper that returns -1
      // on end-of-input and sends the loop backwards, so every truncation of a
      // statement that mixes the tricky forms is exercised. Each construct
      // carries a literal, so a prefix that cuts one open has to keep that
      // literal out of the result as well as terminate.
      it('terminates and leaks nothing on every prefix of a statement mixing every construct', () => {
        const statement =
          "SELECT $t$hunter2$t$, E'a\\'b s3cret', /* /* a@b.c */ */ " +
          '"q""", -19700101, $1, U&\'a@b.c\' -- s3cret';
        for (let i = 0; i <= statement.length; i++) {
          const prefix = statement.slice(0, i);
          assert.strictEqual(
            typeof sanitize(prefix),
            'string',
            `did not return a string for prefix of length ${i}`
          );
          assertNoSecrets(prefix, ` in prefix of length ${i}`);
        }
      });
    });

    describe('leakage', () => {
      it('leaves no literal from any construct in the result', () => {
        assertNoSecrets(
          "SELECT * FROM u WHERE e='a@b.c' AND n=$$hunter2$$ " +
            'AND d=19700101 -- pw=s3cret'
        );
      });

      // Masking a literal depends on finding where it ends, so every delimiter
      // that can be left open is a chance to fall back to emitting the rest of
      // the statement verbatim. Each opener is checked with a body that carries
      // a literal of its own.
      it('leaves no literal behind an unclosed delimiter of any kind', () => {
        for (const opener of [
          '"',
          "'",
          "E'",
          "B'",
          "X'",
          "U&'",
          '$$',
          '$tag$',
          '/*',
        ]) {
          assertNoSecrets(
            `SELECT * FROM u WHERE x = ${opener}a@b.c' AND ` +
              "pw = 'hunter2' AND d = 19700101 -- s3cret"
          );
        }
      });
    });
  });
});
