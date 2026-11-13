/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

describe('NestJS module loading', () => {
  for (const extension of ['cjs', 'mjs']) {
    it(`instruments ${extension === 'cjs' ? 'CommonJS' : 'ESM'} applications`, async function () {
      this.timeout(20000);
      await promisify(execFile)(
        process.execPath,
        [
          '--import',
          join(__dirname, 'register.mjs'),
          join(__dirname, 'fixtures', `use-nestjs.${extension}`),
        ],
        { timeout: 15000 }
      );
    });
  }
});
