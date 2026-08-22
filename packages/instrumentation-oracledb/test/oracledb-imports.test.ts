/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2026, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

describe('oracledb imports', () => {
  it('uses oracledb only as a type in src', () => {
    const sourceDirectory = path.resolve(__dirname, '../src');

    for (const file of fs.readdirSync(sourceDirectory)) {
      if (!file.endsWith('.ts')) continue;

      const source = ts.createSourceFile(
        file,
        fs.readFileSync(path.join(sourceDirectory, file), 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );

      for (const statement of source.statements) {
        if (
          ts.isImportDeclaration(statement) &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          statement.moduleSpecifier.text === 'oracledb'
        ) {
          assert.ok(
            statement.importClause?.isTypeOnly,
            `${file} must import oracledb with \`import type\``
          );
        }
      }
    }
  });
});
