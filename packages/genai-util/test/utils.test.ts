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
  getAttrsFromBaseURL,
  serializeContent,
  formatInputMessages,
  formatOutputMessages,
  formatSystemInstructions,
  calculateDurationSeconds,
  hrTimeToSeconds,
  getSpanName,
  getErrorType,
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
      assert.strictEqual(
        formatSystemInstructions('You are a helpful assistant.'),
        'You are a helpful assistant.'
      );
      assert.strictEqual(
        formatSystemInstructions({
          parts: [{ type: 'text', content: 'test' }],
        }),
        JSON.stringify({ parts: [{ type: 'text', content: 'test' }] })
      );
      assert.strictEqual(formatSystemInstructions(undefined), undefined);
    });
  });

  describe('timing helpers', () => {
    it('hrTimeToSeconds and calculateDurationSeconds', () => {
      const hr: [number, number] = [10, 500000000];
      assert.strictEqual(hrTimeToSeconds(hr), 10.5);

      const startHr: [number, number] = [10, 0];
      const endHr: [number, number] = [12, 500000000];
      assert.strictEqual(calculateDurationSeconds(startHr, endHr), 2.5);

      const startMs = 1000;
      const endMs = 2500;
      assert.strictEqual(calculateDurationSeconds(startMs, endMs), 1.5);

      const startDate = new Date(1000);
      const endDate = new Date(3500);
      assert.strictEqual(calculateDurationSeconds(startDate, endDate), 2.5);
    });
  });

  describe('getSpanName', () => {
    it('should format span name correctly', () => {
      assert.strictEqual(getSpanName('chat', 'gpt-4o'), 'chat gpt-4o');
      assert.strictEqual(getSpanName('chat'), 'chat');
      assert.strictEqual(
        getSpanName('embeddings', 'text-embedding-3-small'),
        'embeddings text-embedding-3-small'
      );
    });
  });

  describe('getErrorType', () => {
    it('should extract error type from Error, custom error, code, string, or unknown', () => {
      assert.strictEqual(getErrorType(new Error('test')), 'Error');
      assert.strictEqual(getErrorType(new TypeError('test')), 'TypeError');

      class CustomAPIError extends Error {
        constructor() {
          super('custom error');
          this.name = 'CustomAPIError';
        }
      }
      assert.strictEqual(getErrorType(new CustomAPIError()), 'CustomAPIError');

      const codedError = new Error('with code');
      (codedError as any).code = 'ECONNREFUSED';
      assert.strictEqual(getErrorType(codedError), 'ECONNREFUSED');

      assert.strictEqual(getErrorType('RateLimitError'), 'RateLimitError');
      assert.strictEqual(getErrorType(''), 'Error');
      assert.strictEqual(getErrorType(null), 'Error');
      assert.strictEqual(getErrorType(undefined), 'Error');
      assert.strictEqual(getErrorType(1234), 'Error');
    });
  });
});
