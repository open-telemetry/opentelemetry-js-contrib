/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import { expect } from 'expect';

describe('LangChain module loading', function () {
  this.timeout(30000);
  for (const extension of ['cjs', 'mjs']) {
    it(`automatically instruments ${extension} entry points`, async () => {
      const args =
        extension === 'mjs'
          ? ['--experimental-loader=@opentelemetry/instrumentation/hook.mjs']
          : [];
      args.push(
        '--require',
        path.join(__dirname, 'fixtures', 'register.cjs'),
        path.join(__dirname, 'fixtures', `scenario.${extension}`)
      );
      const { stdout } = await promisify(execFile)(process.execPath, args, {
        env: {
          ...process.env,
          LANGSMITH_TRACING: 'false',
          LANGCHAIN_TRACING_V2: 'false',
          OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'true',
        },
      });
      expect(stdout).toContain('LangChain fixture passed');
    });
  }
});
