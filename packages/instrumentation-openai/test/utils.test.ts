/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'expect';
import {
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
} from '@opentelemetry/genai-util';
import {
  getEnvBool,
  getAttrsFromBaseURL,
  getProviderNameFromBaseURL,
  setUsageDetailAttributes,
} from '../src/utils';
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

  describe('getProviderNameFromBaseURL', function () {
    it('defaults to openai when baseURL is missing', () => {
      expect(getProviderNameFromBaseURL(undefined)).toBe(
        GEN_AI_PROVIDER_NAME_VALUE_OPENAI
      );
    });

    it('detects OpenAI host', () => {
      expect(getProviderNameFromBaseURL('https://api.openai.com/v1')).toBe(
        GEN_AI_PROVIDER_NAME_VALUE_OPENAI
      );
    });

    it('detects Azure OpenAI host', () => {
      expect(
        getProviderNameFromBaseURL(
          'https://my-resource.openai.azure.com/openai/deployments/gpt'
        )
      ).toBe(GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI);
    });

    it('defaults to openai for unrecognized hosts', () => {
      expect(getProviderNameFromBaseURL('https://llm.example.com/v1')).toBe(
        GEN_AI_PROVIDER_NAME_VALUE_OPENAI
      );
    });
  });

  describe('setUsageDetailAttributes', function () {
    it('sets cache and reasoning attributes from chat completions usage', () => {
      const attrs: Record<string, unknown> = {};
      const span = {
        setAttribute(key: string, value: unknown) {
          attrs[key] = value;
        },
      } as any;

      setUsageDetailAttributes(span, {
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 40 },
        completion_tokens_details: { reasoning_tokens: 8 },
      });

      expect(attrs).toEqual({
        [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 40,
        [ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]: 8,
      });
    });

    it('omits zero-valued usage details', () => {
      const attrs: Record<string, unknown> = {};
      const span = {
        setAttribute(key: string, value: unknown) {
          attrs[key] = value;
        },
      } as any;

      setUsageDetailAttributes(span, {
        prompt_tokens: 5,
        completion_tokens: 1,
        prompt_tokens_details: { cached_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 0 },
      });
      expect(attrs).toEqual({});
      expect(ATTR_GEN_AI_PROVIDER_NAME).toBe('gen_ai.provider.name');
    });

    it('sets cache and reasoning attributes from responses usage', () => {
      const attrs: Record<string, unknown> = {};
      const span = {
        setAttribute(key: string, value: unknown) {
          attrs[key] = value;
        },
      } as any;

      setUsageDetailAttributes(span, {
        input_tokens: 50,
        output_tokens: 12,
        input_tokens_details: { cached_tokens: 10 },
        output_tokens_details: { reasoning_tokens: 3 },
      });

      expect(attrs).toEqual({
        [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 10,
        [ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]: 3,
      });
    });

    it('ignores missing usage details', () => {
      const attrs: Record<string, unknown> = {};
      const span = {
        setAttribute(key: string, value: unknown) {
          attrs[key] = value;
        },
      } as any;

      setUsageDetailAttributes(span, {
        prompt_tokens: 5,
        completion_tokens: 1,
      });
      expect(attrs).toEqual({});
    });
  });
});
