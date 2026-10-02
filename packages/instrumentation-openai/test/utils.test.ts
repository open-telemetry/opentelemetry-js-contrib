/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'expect';
import { getEnvBool, getAttrsFromBaseURL } from '../src/utils';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';

describe('utils', function () {
  describe('getEnvBool', function () {
    afterEach(() => {
      delete process.env.TEST_BOOL_VAR;
    });

    it('returns undefined for unset env var', () => {
      delete process.env.TEST_BOOL_VAR;
      expect(getEnvBool('TEST_BOOL_VAR')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      process.env.TEST_BOOL_VAR = '';
      expect(getEnvBool('TEST_BOOL_VAR')).toBeUndefined();
    });

    it('returns true for "true"', () => {
      process.env.TEST_BOOL_VAR = 'true';
      expect(getEnvBool('TEST_BOOL_VAR')).toBe(true);
    });

    it('returns true for "TRUE"', () => {
      process.env.TEST_BOOL_VAR = 'TRUE';
      expect(getEnvBool('TEST_BOOL_VAR')).toBe(true);
    });

    it('returns false for "false"', () => {
      process.env.TEST_BOOL_VAR = 'false';
      expect(getEnvBool('TEST_BOOL_VAR')).toBe(false);
    });

    it('returns false for "FALSE"', () => {
      process.env.TEST_BOOL_VAR = 'FALSE';
      expect(getEnvBool('TEST_BOOL_VAR')).toBe(false);
    });

    it('returns undefined and warns for invalid value', () => {
      process.env.TEST_BOOL_VAR = 'yes';
      const warnings: string[] = [];
      const mockDiag = { warn: (msg: string) => warnings.push(msg) } as any;
      expect(getEnvBool('TEST_BOOL_VAR', mockDiag)).toBeUndefined();
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('invalid boolean value');
    });
  });

  describe('getAttrsFromBaseURL', function () {
    it('returns undefined for undefined baseURL', () => {
      expect(getAttrsFromBaseURL(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string baseURL', () => {
      expect(getAttrsFromBaseURL('')).toBeUndefined();
    });

    it('returns attributes for https URL', () => {
      const attrs = getAttrsFromBaseURL('https://api.openai.com/v1');
      expect(attrs).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
      });
    });

    it('returns attributes for URL with explicit port', () => {
      const attrs = getAttrsFromBaseURL('http://localhost:8080/v1');
      expect(attrs).toEqual({
        [ATTR_SERVER_ADDRESS]: 'localhost',
        [ATTR_SERVER_PORT]: 8080,
      });
    });

    it('returns undefined and logs for invalid URL', () => {
      const debugMsgs: string[] = [];
      const mockDiag = { debug: (msg: string) => debugMsgs.push(msg) } as any;
      const attrs = getAttrsFromBaseURL('not-a-url', mockDiag);
      expect(attrs).toBeUndefined();
      expect(debugMsgs.length).toBe(1);
      expect(debugMsgs[0]).toContain('could not determine server');
    });
  });
});
