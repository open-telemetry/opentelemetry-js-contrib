/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { defaultDbStatementSerializer } from '../src/index';
import * as assert from 'assert';

describe('#defaultDbStatementSerializer()', () => {
  [
    {
      cmdName: 'UNKNOWN',
      cmdArgs: ['something'],
      expected: 'UNKNOWN [1 other arguments]',
    },
    {
      cmdName: 'ECHO',
      cmdArgs: ['echo'],
      expected: 'ECHO [1 other arguments]',
    },
    {
      cmdName: 'LPUSH',
      cmdArgs: ['list', 'value'],
      expected: 'LPUSH list [1 other arguments]',
    },
    {
      cmdName: 'HSET',
      cmdArgs: ['hash', 'field', 'value'],
      expected: 'HSET hash field [1 other arguments]',
    },
    {
      cmdName: 'INCRBY',
      cmdArgs: ['key', 5],
      expected: 'INCRBY key 5',
    },
    // ACL subcommands with sensitive data should be redacted
    {
      cmdName: 'ACL',
      cmdArgs: [
        'SETUSER',
        'alice',
        'on',
        '>MySecretPass',
        '~user:alice:*',
        '+@read',
        '+@write',
      ],
      expected: 'ACL SETUSER [6 other arguments]',
    },
    {
      cmdName: 'ACL',
      cmdArgs: ['WHOAMI'],
      expected: 'ACL WHOAMI',
    },
    {
      cmdName: 'ACL',
      cmdArgs: ['LIST'],
      expected: 'ACL LIST',
    },
    // CONFIG subcommands with sensitive data should be redacted
    {
      cmdName: 'CONFIG',
      cmdArgs: ['SET', 'requirepass', 'MyNewPassword123'],
      expected: 'CONFIG SET [2 other arguments]',
    },
    {
      cmdName: 'CONFIG',
      cmdArgs: ['GET', 'maxmemory'],
      expected: 'CONFIG GET [1 other arguments]',
    },
    // GETSET (deprecated) args should be redacted since it can contain sensitive data
    {
      cmdName: 'GETSET',
      cmdArgs: ['key', 'secret_value'],
      expected: 'GETSET key [1 other arguments]',
    },
    // PSETEX (deprecated) can also contain sensitive data
    {
      cmdName: 'PSETEX',
      cmdArgs: ['key', '100000', 'secret_value'],
      expected: 'PSETEX key [2 other arguments]',
    },
  ].forEach(({ cmdName, cmdArgs, expected }) => {
    it(`should serialize the correct number of arguments for ${cmdName}`, () => {
      assert.strictEqual(
        defaultDbStatementSerializer(cmdName, cmdArgs),
        expected
      );
    });
  });
});
