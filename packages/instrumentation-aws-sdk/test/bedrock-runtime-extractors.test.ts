/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for the Bedrock Runtime extractors and stream wrappers. These
 * cover payload shapes (prompt caching, Nova tool calls, S3 sources, stream
 * errors) that the recorded responses in bedrock-runtime.test.ts don't.
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import { TelemetryHandler } from '@opentelemetry/genai-util';
import { ReadableSpan } from '@opentelemetry/sdk-trace';
import { expect } from 'expect';
import {
  extractContentBlock,
  extractInvokeModelRequest,
  isEmbeddingInvocation,
  extractInvokeModelResponse,
} from '../src/services/bedrock-runtime/extractors';
import {
  wrapConverseStream,
  wrapInvokeModelStream,
} from '../src/services/bedrock-runtime/stream';

const INPUT_TOKENS = 'gen_ai.usage.input_tokens';
const OUTPUT_TOKENS = 'gen_ai.usage.output_tokens';
const CACHE_READ_TOKENS = 'gen_ai.usage.cache_read.input_tokens';
const CACHE_WRITE_TOKENS = 'gen_ai.usage.cache_write.input_tokens';
const OUTPUT_MESSAGES = 'gen_ai.output.messages';

describe('Bedrock Runtime extractors', () => {
  const handler = new TelemetryHandler({
    instrumentationName: 'bedrock-extractors-test',
    instrumentationVersion: '0.0.0',
    config: { captureMessageContent: 'span_only' },
  });

  let model = 0;
  // A unique model per test, so the span can be found by name.
  function startInference() {
    const requestModel = `test-model-${++model}`;
    const invocation = handler.startInference({
      providerName: 'aws.bedrock',
      requestModel,
      operationName: 'chat',
    });
    const span = () => {
      const spans = getTestSpans().filter(
        s => s.name === `chat ${requestModel}`
      );
      expect(spans.length).toBe(1);
      return spans[0];
    };
    return { invocation, span };
  }

  function outputMessages(span: ReadableSpan) {
    return JSON.parse(span.attributes[OUTPUT_MESSAGES] as string);
  }

  function invokeModelChunks(...payloads: object[]) {
    return payloads.map(payload => ({
      chunk: { bytes: new TextEncoder().encode(JSON.stringify(payload)) },
    }));
  }

  async function* streamOf<T>(chunks: T[], error?: Error) {
    for (const chunk of chunks) yield chunk;
    if (error) throw error;
  }

  async function consume(stream: AsyncIterable<unknown>) {
    for await (const _chunk of stream) {
      // drain
    }
  }

  describe('InvokeModel token usage', () => {
    it('includes cached tokens in the input token count', () => {
      const { invocation, span } = startInference();
      extractInvokeModelResponse(
        {
          content: [{ type: 'text', text: 'Hi' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 20,
          },
        },
        {
          'x-amzn-bedrock-input-token-count': '10',
          'x-amzn-bedrock-output-token-count': '5',
        },
        invocation,
        true
      );
      invocation.stop();

      expect(span().attributes).toMatchObject({
        [INPUT_TOKENS]: 130,
        [OUTPUT_TOKENS]: 5,
        [CACHE_READ_TOKENS]: 100,
        [CACHE_WRITE_TOKENS]: 20,
      });
    });

    it('reads cache counts from headers when there is no body', () => {
      const { invocation, span } = startInference();
      extractInvokeModelResponse(
        undefined,
        {
          'x-amzn-bedrock-input-token-count': '10',
          'x-amzn-bedrock-output-token-count': '5',
          'x-amzn-bedrock-cache-read-input-token-count': '100',
        },
        invocation,
        true
      );
      invocation.stop();

      expect(span().attributes).toMatchObject({
        [INPUT_TOKENS]: 110,
        [OUTPUT_TOKENS]: 5,
        [CACHE_READ_TOKENS]: 100,
      });
    });
  });

  describe('InvokeModel content capture', () => {
    const input = {
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 10,
        system: 'Be brief.',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
      }),
    };
    const response = {
      content: [
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'get_weather',
          input: { location: 'Seattle' },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    it('captures messages when content capture is enabled', () => {
      const data = extractInvokeModelRequest(input, true);
      expect(data.inputMessages).toEqual([
        { role: 'user', parts: [{ type: 'text', content: 'Hi' }] },
      ]);
      expect(data.systemInstructions).toEqual([
        { type: 'text', content: 'Be brief.' },
      ]);

      const { invocation, span } = startInference();
      extractInvokeModelResponse(response, undefined, invocation, true);
      invocation.stop();
      expect(outputMessages(span())).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'toolu_1',
              name: 'get_weather',
              arguments: { location: 'Seattle' },
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
    });

    it('omits messages when content capture is disabled', () => {
      const data = extractInvokeModelRequest(input, false);
      expect(data.inputMessages).toBeUndefined();
      expect(data.systemInstructions).toBeUndefined();

      const { invocation, span } = startInference();
      extractInvokeModelResponse(response, undefined, invocation, false);
      invocation.stop();
      expect(span().attributes).not.toHaveProperty(OUTPUT_MESSAGES);
      expect(span().attributes[INPUT_TOKENS]).toBe(10);
    });
  });

  describe('InvokeModelWithResponseStream', () => {
    it('captures Nova tool calls and cached tokens', async () => {
      const { invocation, span } = startInference();
      const stream = wrapInvokeModelStream(
        handler,
        streamOf(
          invokeModelChunks(
            { messageStart: { role: 'assistant' } },
            {
              contentBlockStart: {
                contentBlockIndex: 0,
                start: { toolUse: { toolUseId: 't1', name: 'get_weather' } },
              },
            },
            {
              contentBlockDelta: {
                contentBlockIndex: 0,
                delta: { toolUse: { input: '{"location":' } },
              },
            },
            {
              contentBlockDelta: {
                contentBlockIndex: 0,
                delta: { toolUse: { input: '"Seattle"}' } },
              },
            },
            { contentBlockStop: { contentBlockIndex: 0 } },
            { messageStop: { stopReason: 'tool_use' } },
            {
              metadata: { usage: { inputTokens: 10, outputTokens: 5 } },
              'amazon-bedrock-invocationMetrics': {
                inputTokenCount: 10,
                outputTokenCount: 5,
                cacheReadInputTokenCount: 100,
                cacheWriteInputTokenCount: 0,
              },
            }
          )
        ),
        invocation,
        true
      );
      await consume(stream);

      expect(span().attributes).toMatchObject({
        'gen_ai.response.finish_reasons': ['tool_call'],
        [INPUT_TOKENS]: 110,
        [OUTPUT_TOKENS]: 5,
        [CACHE_READ_TOKENS]: 100,
      });
      expect(outputMessages(span())).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 't1',
              name: 'get_weather',
              arguments: { location: 'Seattle' },
            },
          ],
          finish_reason: 'tool_call',
        },
      ]);
    });

    it('keeps usage and partial output when the stream fails', async () => {
      const { invocation, span } = startInference();
      const stream = wrapInvokeModelStream(
        handler,
        streamOf(
          invokeModelChunks(
            {
              type: 'message_start',
              message: {
                role: 'assistant',
                usage: { input_tokens: 22, output_tokens: 1 },
              },
            },
            {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'Hel' },
            }
          ),
          new Error('connection reset')
        ),
        invocation,
        true
      );
      await expect(consume(stream)).rejects.toThrow('connection reset');

      const failed = span();
      expect(failed.status.code).toBe(SpanStatusCode.ERROR);
      expect(failed.attributes[INPUT_TOKENS]).toBe(22);
      // The initial count from message_start, as no message_delta arrived.
      expect(failed.attributes[OUTPUT_TOKENS]).toBe(1);
      expect(outputMessages(failed)).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Hel' }],
          finish_reason: 'error',
        },
      ]);
    });
  });

  describe('ConverseStream', () => {
    it('keeps usage and partial output when the stream fails', async () => {
      const { invocation, span } = startInference();
      const stream = wrapConverseStream(
        handler,
        streamOf(
          [
            { messageStart: { role: 'assistant' } },
            {
              contentBlockDelta: {
                contentBlockIndex: 0,
                delta: { text: 'Hi' },
              },
            },
            {
              metadata: {
                usage: {
                  inputTokens: 8,
                  outputTokens: 1,
                  cacheReadInputTokens: 4,
                },
              },
            },
          ],
          new Error('connection reset')
        ),
        invocation,
        true
      );
      await expect(consume(stream)).rejects.toThrow('connection reset');

      const failed = span();
      expect(failed.status.code).toBe(SpanStatusCode.ERROR);
      expect(failed.attributes).toMatchObject({
        [INPUT_TOKENS]: 12,
        [OUTPUT_TOKENS]: 1,
        [CACHE_READ_TOKENS]: 4,
      });
      expect(outputMessages(failed)).toEqual([
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'Hi' }],
          finish_reason: 'error',
        },
      ]);
    });
  });

  describe('content blocks', () => {
    it('maps S3-referenced images and documents to uri parts', () => {
      expect(
        extractContentBlock({
          image: {
            format: 'png',
            source: { s3Location: { uri: 's3://bucket/cat.png' } },
          },
        })
      ).toEqual({
        type: 'uri',
        modality: 'image',
        mime_type: 'image/png',
        uri: 's3://bucket/cat.png',
      });
      expect(
        extractContentBlock({
          document: {
            format: 'pdf',
            name: 'report',
            source: { s3Location: { uri: 's3://bucket/report.pdf' } },
          },
        })
      ).toEqual({
        type: 'uri',
        modality: 'document',
        mime_type: 'application/pdf',
        uri: 's3://bucket/report.pdf',
      });
    });

    it('decodes base64 sources from InvokeModel request bodies', () => {
      const image = extractContentBlock({
        image: { format: 'png', source: { bytes: 'AQID' } },
      });
      expect(image).toMatchObject({
        type: 'blob',
        modality: 'image',
        mime_type: 'image/png',
      });
      expect(Array.from(image!.content as Uint8Array)).toEqual([1, 2, 3]);

      const document = extractContentBlock({
        document: { format: 'pdf', name: 'doc', source: { bytes: 'AQID' } },
      });
      expect(Array.from(document!.content as Uint8Array)).toEqual([1, 2, 3]);
    });

    it('keeps inline image bytes as blob parts', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      expect(
        extractContentBlock({ image: { format: 'jpeg', source: { bytes } } })
      ).toEqual({
        type: 'blob',
        modality: 'image',
        mime_type: 'image/jpeg',
        content: bytes,
      });
    });
  });

  describe('embedding detection', () => {
    const profileArn =
      'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123';
    const body = (payload: object) => JSON.stringify(payload);

    it('detects embedding models by model ID', () => {
      expect(isEmbeddingInvocation('amazon.titan-embed-text-v2:0', '{}')).toBe(
        true
      );
      expect(
        isEmbeddingInvocation(
          'arn:aws:bedrock:us-east-1::foundation-model/cohere.embed-english-v3',
          undefined
        )
      ).toBe(true);
      expect(isEmbeddingInvocation('amazon.titan-text-express-v1', '{}')).toBe(
        false
      );
    });

    it('inspects the body of ARNs that do not name the model', () => {
      expect(
        isEmbeddingInvocation(
          profileArn,
          body({ inputText: 'hi', dimensions: 256, normalize: true })
        )
      ).toBe(true);
      expect(
        isEmbeddingInvocation(
          profileArn,
          body({ texts: ['hi'], input_type: 'search_document' })
        )
      ).toBe(true);
      expect(
        isEmbeddingInvocation(
          profileArn,
          body({ inputImage: 'AQID', embeddingConfig: {} })
        )
      ).toBe(true);
    });

    it('treats ambiguous and chat bodies as chat', () => {
      expect(isEmbeddingInvocation(profileArn, body({ inputText: 'hi' }))).toBe(
        false
      );
      expect(
        isEmbeddingInvocation(
          profileArn,
          body({ inputText: 'hi', textGenerationConfig: { maxTokenCount: 10 } })
        )
      ).toBe(false);
      expect(
        isEmbeddingInvocation(
          profileArn,
          body({ messages: [{ role: 'user', content: 'hi' }] })
        )
      ).toBe(false);
      // Only ARNs are inspected: a plain model ID keeps the model ID check.
      expect(
        isEmbeddingInvocation('custom-model', body({ texts: ['hi'] }))
      ).toBe(false);
    });
  });
});
