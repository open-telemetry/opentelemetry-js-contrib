/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_GEN_AI_REQUEST_CHOICE_COUNT,
  ATTR_GEN_AI_REQUEST_ENCODING_FORMATS,
  ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY,
  ATTR_GEN_AI_REQUEST_MAX_TOKENS,
  ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY,
  ATTR_GEN_AI_REQUEST_REASONING_LEVEL,
  ATTR_GEN_AI_REQUEST_SEED,
  ATTR_GEN_AI_REQUEST_STOP_SEQUENCES,
  ATTR_GEN_AI_REQUEST_STREAM,
  ATTR_GEN_AI_REQUEST_TEMPERATURE,
  ATTR_GEN_AI_REQUEST_TOP_K,
  ATTR_GEN_AI_REQUEST_TOP_P,
} from '../src/semconv';
import {
  getAttrsFromBaseURL,
  serializeContent,
  formatInputMessages,
  formatOutputMessages,
  formatSystemInstructions,
  getErrorType,
  getRequestOptionsAttributes,
} from '../src/utils';

describe('GenAI Utils', () => {
  describe('getAttrsFromBaseURL', () => {
    it('should parse URL into server.address and server.port', () => {
      const attrs1 = getAttrsFromBaseURL('https://api.openai.com/v1');
      assert.deepStrictEqual(attrs1, {
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
      });

      const attrs2 = getAttrsFromBaseURL('http://localhost:8080/v1');
      assert.deepStrictEqual(attrs2, {
        [ATTR_SERVER_ADDRESS]: 'localhost',
        [ATTR_SERVER_PORT]: 8080,
      });

      const attrs3 = getAttrsFromBaseURL(undefined);
      assert.strictEqual(attrs3, undefined);

      const attrs4 = getAttrsFromBaseURL('invalid-url-string');
      assert.strictEqual(attrs4, undefined);
    });
  });

  describe('serialization helpers', () => {
    it('serializeContent', () => {
      assert.strictEqual(serializeContent('hello'), 'hello');
      assert.strictEqual(serializeContent({ a: 1 }), '{"a":1}');
      assert.strictEqual(serializeContent(null), '');
      assert.strictEqual(serializeContent(undefined), '');
    });

    it('formatInputMessages', () => {
      const msgs = [
        {
          role: 'user',
          parts: [{ type: 'text', content: 'hello' }],
        },
      ];
      assert.strictEqual(formatInputMessages(msgs), JSON.stringify(msgs));
      assert.strictEqual(formatInputMessages(undefined), undefined);
    });

    it('formatOutputMessages', () => {
      const msgs = [
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'world' }],
          finish_reason: 'stop',
        },
      ];
      assert.strictEqual(formatOutputMessages(msgs), JSON.stringify(msgs));
      assert.strictEqual(formatOutputMessages(undefined), undefined);
    });

    it('formatSystemInstructions', () => {
      const instructions = [{ type: 'text' as const, content: 'test' }];
      assert.strictEqual(
        formatSystemInstructions(instructions),
        JSON.stringify(instructions)
      );
      assert.strictEqual(
        formatSystemInstructions('You are a helpful assistant.'),
        'You are a helpful assistant.'
      );
      assert.strictEqual(formatSystemInstructions(undefined), undefined);
    });
  });

  describe('getErrorType', () => {
    it('should return error name for standard built-in errors', () => {
      assert.strictEqual(getErrorType(new Error('test')), 'Error');
      assert.strictEqual(getErrorType(new TypeError('test')), 'TypeError');
      assert.strictEqual(getErrorType(new RangeError('test')), 'RangeError');
    });

    it('should return constructor name for subclassed errors without name override', () => {
      class SubclassedErrorWithoutNameOverride extends Error {}
      assert.strictEqual(
        getErrorType(
          new SubclassedErrorWithoutNameOverride('subclassed error')
        ),
        'SubclassedErrorWithoutNameOverride'
      );
    });

    it('should return custom name when explicitly set on class or instance', () => {
      class CustomNamedError extends Error {
        constructor() {
          super('custom error');
          this.name = 'CustomAPIError';
        }
      }
      assert.strictEqual(
        getErrorType(new CustomNamedError()),
        'CustomAPIError'
      );

      const errWithCustomName = new Error('custom name on instance');
      errWithCustomName.name = 'RateLimitError';
      assert.strictEqual(getErrorType(errWithCustomName), 'RateLimitError');
    });

    it('should prioritize explicit name over constructor name for minification support', () => {
      const MinifiedErrorClass = class extends Error {
        constructor() {
          super('minified error');
          this.name = 'AnthropicAPIError';
        }
      };
      Object.defineProperty(MinifiedErrorClass, 'name', { value: 'e' });

      assert.strictEqual(
        getErrorType(new MinifiedErrorClass()),
        'AnthropicAPIError'
      );
    });

    it('should prioritize error code over error name or constructor name', () => {
      class CustomAPIError extends Error {
        code = 'RATE_LIMIT_EXCEEDED';
        override name = 'RateLimitError';
      }
      assert.strictEqual(
        getErrorType(new CustomAPIError()),
        'RATE_LIMIT_EXCEEDED'
      );
    });

    it('should handle numeric error codes including 0', () => {
      const http404Error = Object.assign(new Error('not found'), { code: 404 });
      assert.strictEqual(getErrorType(http404Error), '404');

      const code0Error = Object.assign(new Error('exit code 0'), { code: 0 });
      assert.strictEqual(getErrorType(code0Error), '0');
    });

    it('should ignore empty or whitespace-only code and fall back to error name', () => {
      const emptyCodeError = Object.assign(new TypeError('type issue'), {
        code: '   ',
      });
      assert.strictEqual(getErrorType(emptyCodeError), 'TypeError');
    });

    it('should handle unusual prototypes and constructor objects', () => {
      const objectInheritedError = Object.create(Error.prototype);
      assert.strictEqual(getErrorType(objectInheritedError), 'Error');

      const noConstructorError = new Error('no constructor');
      (noConstructorError as any).constructor = undefined;
      assert.strictEqual(getErrorType(noConstructorError), 'Error');
    });

    it('should extract error type from string error inputs', () => {
      assert.strictEqual(getErrorType('RateLimitError'), 'RateLimitError');
      assert.strictEqual(getErrorType('   '), '_OTHER');
      assert.strictEqual(getErrorType(''), '_OTHER');
    });

    it('should return default "_OTHER" for nullish, boolean, number, or plain object inputs', () => {
      assert.strictEqual(getErrorType(null), '_OTHER');
      assert.strictEqual(getErrorType(undefined), '_OTHER');
      assert.strictEqual(getErrorType(1234), '_OTHER');
      assert.strictEqual(getErrorType(true), '_OTHER');
      assert.strictEqual(getErrorType({}), '_OTHER');
      assert.strictEqual(getErrorType({ message: 'plain obj' }), '_OTHER');
    });
  });

  describe('getRequestOptionsAttributes', () => {
    it('should return empty object if requestOptions is undefined or empty', () => {
      assert.deepStrictEqual(getRequestOptionsAttributes(undefined), {});
      assert.deepStrictEqual(getRequestOptionsAttributes({}), {});
    });

    it('should extract all request options into semantic convention attributes', () => {
      const result = getRequestOptionsAttributes({
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxTokens: 1024,
        stopSequences: ['STOP', 'END'],
        frequencyPenalty: 0.5,
        presencePenalty: 0.6,
        choiceCount: 3,
        seed: 42,
        encodingFormats: ['text', 'json'],
        stream: true,
        reasoningLevel: 'high',
      });

      assert.deepStrictEqual(result, {
        [ATTR_GEN_AI_REQUEST_TEMPERATURE]: 0.7,
        [ATTR_GEN_AI_REQUEST_TOP_P]: 0.9,
        [ATTR_GEN_AI_REQUEST_TOP_K]: 40,
        [ATTR_GEN_AI_REQUEST_MAX_TOKENS]: 1024,
        [ATTR_GEN_AI_REQUEST_STOP_SEQUENCES]: ['STOP', 'END'],
        [ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY]: 0.5,
        [ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY]: 0.6,
        [ATTR_GEN_AI_REQUEST_CHOICE_COUNT]: 3,
        [ATTR_GEN_AI_REQUEST_SEED]: 42,
        [ATTR_GEN_AI_REQUEST_ENCODING_FORMATS]: ['text', 'json'],
        [ATTR_GEN_AI_REQUEST_STREAM]: true,
        [ATTR_GEN_AI_REQUEST_REASONING_LEVEL]: 'high',
      });
    });

    it('should ignore empty stopSequences and encodingFormats arrays', () => {
      const result = getRequestOptionsAttributes({
        stopSequences: [],
        encodingFormats: [],
      });
      assert.deepStrictEqual(result, {});
    });
  });
});
