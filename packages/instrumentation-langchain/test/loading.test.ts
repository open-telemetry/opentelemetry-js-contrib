/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

describe('LangChain workflow module loading', () => {
  for (const first of ['cjs', 'esm']) {
    it(`instruments CJS and ESM copies, loading ${first} first`, async function () {
      if (Number(process.versions.node.split('.')[0]) < 20) this.skip();
      this.timeout(20000);
      await promisify(execFile)(
        process.execPath,
        [
          '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
          join(__dirname, 'fixtures', 'workflow-loading.cjs'),
          first,
        ],
        {
          timeout: 15000,
          env: {
            ...process.env,
            LANGSMITH_TRACING: 'false',
            LANGCHAIN_TRACING_V2: 'false',
            LANGCHAIN_TRACING: 'false',
          },
        }
      );
    });
  }
});
