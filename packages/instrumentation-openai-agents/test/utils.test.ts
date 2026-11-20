/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import type { DiagLogger } from '@opentelemetry/api';
import { getEnvBool } from '../src/utils';

const ENV_NAME = 'OTEL_TEST_OPENAI_AGENTS_BOOL';

describe('utils', () => {
  describe('getEnvBool', () => {
    afterEach(() => {
      delete process.env[ENV_NAME];
    });

    it('returns undefined when the variable is unset', () => {
      assert.strictEqual(getEnvBool(ENV_NAME), undefined);
    });

    it('returns undefined for an empty string', () => {
      process.env[ENV_NAME] = '';
      assert.strictEqual(getEnvBool(ENV_NAME), undefined);
    });

    it('parses "true" case-insensitively', () => {
      for (const value of ['true', 'TRUE', 'True']) {
        process.env[ENV_NAME] = value;
        assert.strictEqual(getEnvBool(ENV_NAME), true, value);
      }
    });

    it('parses "false" case-insensitively', () => {
      for (const value of ['false', 'FALSE', 'False']) {
        process.env[ENV_NAME] = value;
        assert.strictEqual(getEnvBool(ENV_NAME), false, value);
      }
    });

    it('warns and returns undefined for an invalid value', () => {
      process.env[ENV_NAME] = 'yes';
      const warnings: string[] = [];
      const logger = {
        warn: (message: string) => {
          warnings.push(message);
        },
      } as unknown as DiagLogger;

      assert.strictEqual(getEnvBool(ENV_NAME, logger), undefined);
      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0], /invalid boolean value .*=yes/);
    });
  });
});
