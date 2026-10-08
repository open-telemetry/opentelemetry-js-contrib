/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  ATTR_GEN_AI_REQUEST_CHOICE_COUNT,
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
  serializeContent,
  formatInputMessages,
  formatOutputMessages,
  formatSystemInstructions,
  getErrorType,
  getRequestOptionsAttributes,
  inferMissingModalityCounts,
  inferMissingTokenCounts,
  mergeTokenUsage,
  mergeTokenUsageDetails,
  sumTokenCountsAcrossModalities,
} from '../src/utils';
import type {
  BlobPart,
  InputMessages,
  OutputMessages,
  SystemInstructions,
  TokenUsageDetails,
} from '../src/types';

describe('GenAI Utils', () => {
  describe('serialization helpers', () => {
    it('serializeContent', () => {
      assert.strictEqual(serializeContent('hello'), 'hello');
      assert.strictEqual(serializeContent({ a: 1 }), '{"a":1}');
      assert.strictEqual(serializeContent([1, 2]), '[1,2]');
      assert.strictEqual(serializeContent(123), '123');
      assert.strictEqual(serializeContent(true), 'true');
      assert.strictEqual(serializeContent(null), '');
      assert.strictEqual(serializeContent(undefined), '');
      assert.strictEqual(
        serializeContent(() => {}),
        '[Unserializable Content]'
      );
      assert.strictEqual(serializeContent(Symbol('test')), 'Symbol(test)');
      assert.strictEqual(serializeContent(BigInt(42)), '42');

      const circular: Record<string, unknown> = {};
      circular.self = circular;
      assert.strictEqual(serializeContent(circular), '[object Object]');

      const undefinedToJSON = { toJSON: () => undefined };
      assert.strictEqual(serializeContent(undefinedToJSON), '[object Object]');

      const throwing: Record<string, unknown> = {};
      throwing.self = throwing;
      throwing.toString = () => {
        throw new Error('fail');
      };
      assert.strictEqual(
        serializeContent(throwing),
        '[Unserializable Content]'
      );
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
      assert.strictEqual(formatInputMessages([]), undefined);

      // BlobPart handling with Uint8Array base64 encoding
      const blobPart: BlobPart = {
        type: 'blob',
        modality: 'image',
        content: new Uint8Array([72, 101, 108, 108, 111]), // 'Hello'
        mime_type: 'image/png',
      };
      const msgsWithBlob: InputMessages = [
        {
          role: 'user',
          parts: [blobPart],
        },
      ];
      assert.strictEqual(
        formatInputMessages(msgsWithBlob),
        JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                type: 'blob',
                modality: 'image',
                content: 'SGVsbG8=',
                mime_type: 'image/png',
              },
            ],
          },
        ])
      );

      // BlobPart handling with Buffer base64 encoding
      const blobPartWithBuffer: BlobPart = {
        type: 'blob',
        modality: 'image',
        content: Buffer.from([72, 101, 108, 108, 111]), // 'Hello'
        mime_type: 'image/png',
      };
      const msgsWithBuffer: InputMessages = [
        {
          role: 'user',
          parts: [blobPartWithBuffer],
        },
      ];
      assert.strictEqual(
        formatInputMessages(msgsWithBuffer),
        JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                type: 'blob',
                modality: 'image',
                content: 'SGVsbG8=',
                mime_type: 'image/png',
              },
            ],
          },
        ])
      );

      const emptyBlobPart: BlobPart = {
        type: 'blob',
        modality: 'image',
        content: new Uint8Array([]),
        mime_type: 'image/png',
      };
      const msgsWithEmptyBlob: InputMessages = [
        {
          role: 'user',
          parts: [emptyBlobPart],
        },
      ];
      assert.strictEqual(
        formatInputMessages(msgsWithEmptyBlob),
        JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                type: 'blob',
                modality: 'image',
                content: '',
                mime_type: 'image/png',
              },
            ],
          },
        ])
      );
    });

    it('formatOutputMessages', () => {
      const msgs: OutputMessages = [
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'world' }],
          finish_reason: 'stop',
        },
      ];
      assert.strictEqual(formatOutputMessages(msgs), JSON.stringify(msgs));
      assert.strictEqual(formatOutputMessages(undefined), undefined);
      assert.strictEqual(formatOutputMessages([]), undefined);

      const blobPart: BlobPart = {
        type: 'blob',
        modality: 'image',
        content: new Uint8Array([72, 101, 108, 108, 111]),
        mime_type: 'image/png',
      };
      const msgsWithBlob: OutputMessages = [
        {
          role: 'assistant',
          parts: [blobPart],
        },
      ];
      assert.strictEqual(
        formatOutputMessages(msgsWithBlob),
        JSON.stringify([
          {
            role: 'assistant',
            parts: [
              {
                type: 'blob',
                modality: 'image',
                content: 'SGVsbG8=',
                mime_type: 'image/png',
              },
            ],
          },
        ])
      );

      const bufferBlobPart: BlobPart = {
        type: 'blob',
        modality: 'image',
        content: Buffer.from([72, 101, 108, 108, 111]),
        mime_type: 'image/png',
      };
      const msgsWithBufferBlob: OutputMessages = [
        {
          role: 'assistant',
          parts: [bufferBlobPart],
        },
      ];
      assert.strictEqual(
        formatOutputMessages(msgsWithBufferBlob),
        JSON.stringify([
          {
            role: 'assistant',
            parts: [
              {
                type: 'blob',
                modality: 'image',
                content: 'SGVsbG8=',
                mime_type: 'image/png',
              },
            ],
          },
        ])
      );

      const emptyBlobPart: BlobPart = {
        type: 'blob',
        modality: 'image',
        content: new Uint8Array([]),
        mime_type: 'image/png',
      };
      const msgsWithEmptyBlob: OutputMessages = [
        {
          role: 'assistant',
          parts: [emptyBlobPart],
        },
      ];
      assert.strictEqual(
        formatOutputMessages(msgsWithEmptyBlob),
        JSON.stringify([
          {
            role: 'assistant',
            parts: [
              {
                type: 'blob',
                modality: 'image',
                content: '',
                mime_type: 'image/png',
              },
            ],
          },
        ])
      );
    });

    it('formatSystemInstructions', () => {
      const instructions: SystemInstructions = [
        { type: 'text', content: 'test' },
      ];
      assert.strictEqual(
        formatSystemInstructions(instructions),
        JSON.stringify(instructions)
      );

      const multipleInstructions: SystemInstructions = [
        { type: 'text', content: 'You are a helpful assistant.' },
        { type: 'text', content: 'Be concise.' },
      ];
      assert.strictEqual(
        formatSystemInstructions(multipleInstructions),
        JSON.stringify(multipleInstructions)
      );

      // Normalizes plain string input to SystemInstructions JSON array
      assert.strictEqual(
        formatSystemInstructions('You are a helpful assistant.'),
        JSON.stringify([
          { type: 'text', content: 'You are a helpful assistant.' },
        ])
      );

      // Preserves already-serialized JSON array of parts
      assert.strictEqual(
        formatSystemInstructions(
          JSON.stringify([{ type: 'text', content: 'serialized' }])
        ),
        JSON.stringify([{ type: 'text', content: 'serialized' }])
      );

      // Wraps string array starting with [ as plain text, preventing schema corruption
      assert.strictEqual(
        formatSystemInstructions('["Rule 1", "Rule 2"]'),
        JSON.stringify([{ type: 'text', content: '["Rule 1", "Rule 2"]' }])
      );

      // Handles non-array JSON string starting with [
      assert.strictEqual(
        formatSystemInstructions('[invalid json'),
        JSON.stringify([{ type: 'text', content: '[invalid json' }])
      );

      // Handles empty inputs by returning undefined
      assert.strictEqual(formatSystemInstructions(''), undefined);
      assert.strictEqual(formatSystemInstructions('   '), undefined);
      assert.strictEqual(formatSystemInstructions([]), undefined);
      assert.strictEqual(formatSystemInstructions('[]'), undefined);
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

    it('should return default "_OTHER" for string error inputs', () => {
      assert.strictEqual(getErrorType('RateLimitError'), '_OTHER');
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
        [ATTR_GEN_AI_REQUEST_STREAM]: true,
        [ATTR_GEN_AI_REQUEST_REASONING_LEVEL]: 'high',
      });
    });

    it('should only set stream attribute when stream is true and omit when false or undefined', () => {
      assert.deepStrictEqual(getRequestOptionsAttributes({ stream: true }), {
        [ATTR_GEN_AI_REQUEST_STREAM]: true,
      });
      assert.deepStrictEqual(
        getRequestOptionsAttributes({ stream: false }),
        {}
      );
      assert.deepStrictEqual(getRequestOptionsAttributes({}), {});
    });

    it('should ignore empty stopSequences array', () => {
      const result = getRequestOptionsAttributes({
        stopSequences: [],
      });
      assert.deepStrictEqual(result, {});
    });
  });

  describe('sumTokenCountsAcrossModalities', () => {
    it('should sum the counts of every modality', () => {
      assert.strictEqual(
        sumTokenCountsAcrossModalities({
          text: 100,
          image: 50,
          audio: 5,
          unknown: 10,
        }),
        165
      );
    });

    it('should return undefined, not 0, when there is no count', () => {
      assert.strictEqual(sumTokenCountsAcrossModalities(undefined), undefined);
      assert.strictEqual(sumTokenCountsAcrossModalities({}), undefined);
      assert.strictEqual(
        sumTokenCountsAcrossModalities({ text: undefined }),
        undefined
      );
    });

    it('should keep an explicit 0', () => {
      assert.strictEqual(sumTokenCountsAcrossModalities({ text: 0 }), 0);
    });

    it('should ignore negative counts', () => {
      assert.strictEqual(
        sumTokenCountsAcrossModalities({ text: 10, image: -5 }),
        10
      );
      assert.strictEqual(
        sumTokenCountsAcrossModalities({ text: -1 }),
        undefined
      );
    });
  });

  describe('mergeTokenUsage', () => {
    it('should only overwrite fields defined in the update', () => {
      const merged = mergeTokenUsage(
        { inputTokens: { text: 10 }, cacheReadTokens: { text: 4 } },
        { outputTokens: { text: 20 }, inputTokens: undefined }
      );
      assert.deepStrictEqual(merged, {
        inputTokens: { text: 10 },
        outputTokens: { text: 20 },
        cacheReadTokens: { text: 4 },
      });
    });

    it('should not mutate the existing usage or the update', () => {
      const existing = { inputTokens: { text: 10 } };
      const update = { outputTokens: { text: 20 } };
      mergeTokenUsage(existing, update);
      assert.deepStrictEqual(existing, { inputTokens: { text: 10 } });
      assert.deepStrictEqual(update, { outputTokens: { text: 20 } });
    });
  });

  describe('mergeTokenUsageDetails', () => {
    it('should merge scalar counts and modality breakdowns', () => {
      const existing: TokenUsageDetails = {
        inputTokenCount: 100,
        cacheReadTokenCount: 40,
        tokenUsageByModality: {
          inputTokens: { text: 100 },
          cacheReadTokens: { text: 40 },
        },
      };
      const update: TokenUsageDetails = {
        outputTokenCount: 50,
        inputTokenCount: undefined,
        tokenUsageByModality: {
          outputTokens: { text: 50 },
          inputTokens: undefined,
        },
      };

      const merged = mergeTokenUsageDetails(existing, update);
      assert.deepStrictEqual(merged, {
        inputTokenCount: 100,
        outputTokenCount: 50,
        cacheReadTokenCount: 40,
        tokenUsageByModality: {
          inputTokens: { text: 100 },
          outputTokens: { text: 50 },
          cacheReadTokens: { text: 40 },
        },
      });
    });

    it('should handle undefined existing details', () => {
      const update: TokenUsageDetails = {
        inputTokenCount: 20,
        tokenUsageByModality: { inputTokens: { text: 20 } },
      };
      const merged = mergeTokenUsageDetails(undefined, update);
      assert.deepStrictEqual(merged, update);
    });

    it('should not mutate the existing details or update', () => {
      const existing: TokenUsageDetails = { inputTokenCount: 10 };
      const update: TokenUsageDetails = { outputTokenCount: 20 };
      mergeTokenUsageDetails(existing, update);
      assert.deepStrictEqual(existing, { inputTokenCount: 10 });
      assert.deepStrictEqual(update, { outputTokenCount: 20 });
    });
  });

  describe('inferMissingTokenCounts', () => {
    it('should infer inputTokenCount from cacheReadTokenCount and cacheWriteTokenCount', () => {
      const usage: TokenUsageDetails = {
        cacheReadTokenCount: 50,
        cacheWriteTokenCount: 30,
      };
      const inferred = inferMissingTokenCounts(usage);
      assert.strictEqual(inferred.inputTokenCount, 80);
    });

    it('should infer outputTokenCount from reasoningTokenCount', () => {
      const usage: TokenUsageDetails = {
        reasoningTokenCount: 25,
      };
      const inferred = inferMissingTokenCounts(usage);
      assert.strictEqual(inferred.outputTokenCount, 25);
    });

    it('should infer modality inputTokens and outputTokens if tokenUsageByModality is present', () => {
      const usage: TokenUsageDetails = {
        cacheReadTokenCount: 10,
        cacheWriteTokenCount: 20,
        reasoningTokenCount: 15,
        tokenUsageByModality: {
          cacheReadTokens: { text: 10 },
          cacheWriteTokens: { text: 10, image: 10 },
          reasoningTokens: { text: 15 },
        },
      };
      const inferred = inferMissingTokenCounts(usage);
      assert.deepStrictEqual(inferred.tokenUsageByModality?.inputTokens, {
        text: 20,
        image: 10,
      });
      assert.deepStrictEqual(inferred.tokenUsageByModality?.outputTokens, {
        text: 15,
      });
    });

    it('should not overwrite already reported input and output token counts or modalities', () => {
      const usage: TokenUsageDetails = {
        inputTokenCount: 100,
        outputTokenCount: 50,
        cacheReadTokenCount: 10,
        reasoningTokenCount: 5,
        tokenUsageByModality: {
          inputTokens: { text: 100 },
          outputTokens: { text: 50 },
          cacheReadTokens: { text: 10 },
          reasoningTokens: { text: 5 },
        },
      };
      const inferred = inferMissingTokenCounts(usage);
      assert.strictEqual(inferred.inputTokenCount, 100);
      assert.strictEqual(inferred.outputTokenCount, 50);
      assert.deepStrictEqual(inferred.tokenUsageByModality?.inputTokens, {
        text: 100,
      });
      assert.deepStrictEqual(inferred.tokenUsageByModality?.outputTokens, {
        text: 50,
      });
    });
  });

  describe('inferMissingModalityCounts', () => {
    it('should return a copy of usage unmodified when there are no token counts', () => {
      const usage: TokenUsageDetails = {};
      const inferred = inferMissingModalityCounts(usage);
      assert.deepStrictEqual(inferred, {});
    });

    it('should attribute missing modality breakdowns to unknown', () => {
      const usage: TokenUsageDetails = {
        inputTokenCount: 100,
        outputTokenCount: 50,
        reasoningTokenCount: 20,
        cacheReadTokenCount: 30,
        cacheWriteTokenCount: 15,
      };
      const inferred = inferMissingModalityCounts(usage);
      assert.deepStrictEqual(inferred.tokenUsageByModality, {
        inputTokens: { unknown: 100 },
        outputTokens: { unknown: 50 },
        reasoningTokens: { unknown: 20 },
        cacheReadTokens: { unknown: 30 },
        cacheWriteTokens: { unknown: 15 },
      });
    });

    it('should attribute the missing delta to unknown when partial modality breakdown is provided', () => {
      const usage: TokenUsageDetails = {
        inputTokenCount: 100,
        outputTokenCount: 50,
        tokenUsageByModality: {
          inputTokens: { text: 60 },
          outputTokens: { text: 30, unknown: 10 },
        },
      };
      const inferred = inferMissingModalityCounts(usage);
      assert.deepStrictEqual(inferred.tokenUsageByModality?.inputTokens, {
        text: 60,
        unknown: 40,
      });
      assert.deepStrictEqual(inferred.tokenUsageByModality?.outputTokens, {
        text: 30,
        unknown: 20,
      });
    });

    it('should not alter modality breakdown when sum covers or exceeds the total count', () => {
      const usageEqual: TokenUsageDetails = {
        inputTokenCount: 50,
        tokenUsageByModality: {
          inputTokens: { text: 50 },
        },
      };
      const inferredEqual = inferMissingModalityCounts(usageEqual);
      assert.deepStrictEqual(inferredEqual.tokenUsageByModality?.inputTokens, {
        text: 50,
      });

      const usageExceeds: TokenUsageDetails = {
        inputTokenCount: 50,
        tokenUsageByModality: {
          inputTokens: { text: 40, image: 30 },
        },
      };
      const inferredExceeds = inferMissingModalityCounts(usageExceeds);
      assert.deepStrictEqual(
        inferredExceeds.tokenUsageByModality?.inputTokens,
        {
          text: 40,
          image: 30,
        }
      );
    });

    it('should ignore negative counts when inferring modality counts', () => {
      const usage: TokenUsageDetails = {
        inputTokenCount: -10,
        tokenUsageByModality: {
          inputTokens: { text: 10 },
        },
      };
      const inferred = inferMissingModalityCounts(usage);
      assert.deepStrictEqual(inferred.tokenUsageByModality?.inputTokens, {
        text: 10,
      });
    });
  });
});
