/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'expect';
import {
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
  GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK,
  GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
} from '@opentelemetry/genai-util';
import {
  formatChatMessageContent,
  getEnvBool,
  getAttrsFromBaseURL,
  getProviderNameFromBaseURL,
  IMAGE_CONTENT_PLACEHOLDER,
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

    it('detects Bedrock runtime hostnames only', () => {
      expect(
        getProviderNameFromBaseURL(
          'https://bedrock-runtime.us-east-1.amazonaws.com'
        )
      ).toBe(GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK);
    });

    it('does not attribute unrelated amazonaws hosts as Bedrock', () => {
      expect(
        getProviderNameFromBaseURL('https://my-bucket.s3.amazonaws.com')
      ).toBe(GEN_AI_PROVIDER_NAME_VALUE_OPENAI);
    });

    it('defaults unknown OpenAI-compatible hosts to openai (protocol default)', () => {
      expect(getProviderNameFromBaseURL('https://llm.example.com/v1')).toBe(
        GEN_AI_PROVIDER_NAME_VALUE_OPENAI
      );
      expect(
        getProviderNameFromBaseURL('https://api.fireworks.ai/inference/v1')
      ).toBe(GEN_AI_PROVIDER_NAME_VALUE_OPENAI);
    });

    it('defaults malformed URLs to openai without throwing', () => {
      const debugMsgs: string[] = [];
      const mockDiag = { debug: (msg: string) => debugMsgs.push(msg) } as any;
      expect(getProviderNameFromBaseURL('not a url', mockDiag)).toBe(
        GEN_AI_PROVIDER_NAME_VALUE_OPENAI
      );
      expect(debugMsgs.length).toBe(1);
    });
  });

  describe('setUsageDetailAttributes', function () {
    function collectAttrs(
      usage: Parameters<typeof setUsageDetailAttributes>[1]
    ) {
      const attrs: Record<string, unknown> = {};
      const span = {
        setAttribute(key: string, value: unknown) {
          attrs[key] = value;
        },
      } as any;
      setUsageDetailAttributes(span, usage);
      return attrs;
    }

    it('sets cache and reasoning attributes from chat completions usage', () => {
      expect(
        collectAttrs({
          prompt_tokens: 100,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 40 },
          completion_tokens_details: { reasoning_tokens: 8 },
        })
      ).toEqual({
        [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 40,
        [ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]: 8,
      });
    });

    it('sets cache and reasoning attributes from responses usage', () => {
      expect(
        collectAttrs({
          input_tokens: 50,
          output_tokens: 12,
          input_tokens_details: { cached_tokens: 10 },
          output_tokens_details: { reasoning_tokens: 3 },
        })
      ).toEqual({
        [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 10,
        [ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]: 3,
      });
    });

    it('omits zero-valued usage details', () => {
      expect(
        collectAttrs({
          prompt_tokens: 5,
          completion_tokens: 1,
          prompt_tokens_details: { cached_tokens: 0 },
          completion_tokens_details: { reasoning_tokens: 0 },
        })
      ).toEqual({});
    });

    it('omits negative usage details', () => {
      expect(
        collectAttrs({
          prompt_tokens_details: { cached_tokens: -1 },
          completion_tokens_details: { reasoning_tokens: -5 },
        })
      ).toEqual({});
    });

    it('omits missing usage and missing detail objects', () => {
      expect(collectAttrs(undefined)).toEqual({});
      expect(collectAttrs(null)).toEqual({});
      expect(
        collectAttrs({
          prompt_tokens: 5,
          completion_tokens: 1,
        })
      ).toEqual({});
    });

    it('omits non-numeric and non-finite usage details', () => {
      expect(
        collectAttrs({
          prompt_tokens_details: {
            cached_tokens: '12' as unknown as number,
          },
          completion_tokens_details: {
            reasoning_tokens: Number.NaN,
          },
        })
      ).toEqual({});
      expect(
        collectAttrs({
          input_tokens_details: {
            cached_tokens: Number.POSITIVE_INFINITY,
          },
          output_tokens_details: {
            reasoning_tokens: null,
          },
        })
      ).toEqual({});
    });

    it('handles streaming-style partial usage objects', () => {
      // Stream usage chunks may only populate one side of the details.
      expect(
        collectAttrs({
          prompt_tokens: 22,
          completion_tokens: 3,
          prompt_tokens_details: { cached_tokens: 7 },
          completion_tokens_details: undefined,
        })
      ).toEqual({
        [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: 7,
      });
      expect(
        collectAttrs({
          prompt_tokens: 22,
          completion_tokens: 3,
          prompt_tokens_details: null,
          completion_tokens_details: { reasoning_tokens: 2 },
        })
      ).toEqual({
        [ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]: 2,
      });
    });
  });

  describe('formatChatMessageContent', function () {
    it('returns empty string for non-arrays', () => {
      expect(formatChatMessageContent(undefined)).toBe('');
      expect(formatChatMessageContent(null)).toBe('');
    });

    it('joins text parts', () => {
      expect(
        formatChatMessageContent([
          { type: 'text', text: 'hello' },
          { type: 'text', text: 'world' },
        ])
      ).toBe('hello\nworld');
    });

    it('records image parts as placeholder and never exports raw URLs', () => {
      const signed =
        'https://cdn.example.com/img.png?X-Amz-Signature=secret-token';
      const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
      const formatted = formatChatMessageContent([
        { type: 'text', text: 'see' },
        { type: 'image_url', image_url: { url: signed } },
        { type: 'image_url', image_url: dataUri },
        { type: 'image_url', image_url: { url: dataUri } },
      ]);
      expect(formatted).toBe(
        `see\n${IMAGE_CONTENT_PLACEHOLDER}\n${IMAGE_CONTENT_PLACEHOLDER}\n${IMAGE_CONTENT_PLACEHOLDER}`
      );
      expect(formatted).not.toContain('Signature');
      expect(formatted).not.toContain('data:image');
      expect(formatted).not.toContain('cdn.example.com');
    });

    it('skips malformed image objects and unknown parts', () => {
      expect(
        formatChatMessageContent([
          { type: 'image_url', image_url: { url: 123 as unknown as string } },
          { type: 'image_url', image_url: null },
          { type: 'input_audio' as any },
          null as any,
          { type: 'text', text: 'ok' },
        ])
      ).toBe(
        // image_url type still yields placeholder even when url is malformed;
        // we never read the url value.
        `${IMAGE_CONTENT_PLACEHOLDER}\n${IMAGE_CONTENT_PLACEHOLDER}\nok`
      );
    });

    it('includes refusal text when present', () => {
      expect(
        formatChatMessageContent([{ type: 'refusal', refusal: 'nope' }])
      ).toBe('nope');
    });
  });
});
