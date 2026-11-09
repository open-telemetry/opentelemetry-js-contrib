/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'expect';
import {
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  extractChatInputMessages,
  extractChatOutputMessages,
  extractChatTokenUsage,
  extractResponsesTokenUsage,
  getAttrsFromBaseURL,
  getEnvBool,
  getOpenAIErrorType,
  inferEmbeddingDimensions,
  normalizeChatFinishReason,
  parseBaseURL,
  parseJsonArguments,
  parseUriOrBlobPart,
  resolveCaptureMode,
  responseFormatToOutputType,
} from '../src/utils';
import {
  convertResponsesInputToMessages,
  convertResponsesOutputToMessages,
  deriveResponsesFinishReason,
  extractResponsesConversationId,
  extractResponsesSystemInstructions,
  hasCompactionItems,
} from '../src/responses';

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

  describe('parseBaseURL & getAttrsFromBaseURL', function () {
    it('returns undefined for undefined baseURL', () => {
      expect(parseBaseURL(undefined)).toEqual({});
      expect(getAttrsFromBaseURL(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string baseURL', () => {
      expect(parseBaseURL('')).toEqual({});
      expect(getAttrsFromBaseURL('')).toBeUndefined();
    });

    it('returns attributes for https URL', () => {
      const attrs = getAttrsFromBaseURL('https://api.openai.com/v1');
      expect(attrs).toEqual({
        [ATTR_SERVER_ADDRESS]: 'api.openai.com',
        [ATTR_SERVER_PORT]: 443,
      });
    });

    it('returns default port 80 for http URL without port', () => {
      const attrs = getAttrsFromBaseURL('http://example.internal/v1');
      expect(attrs).toEqual({
        [ATTR_SERVER_ADDRESS]: 'example.internal',
        [ATTR_SERVER_PORT]: 80,
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

  describe('resolveCaptureMode', function () {
    it('normalizes boolean, ContentCaptureMode, and env var strings', () => {
      expect(resolveCaptureMode(undefined)).toBe('none');
      expect(resolveCaptureMode(null)).toBe('none');
      expect(resolveCaptureMode(false)).toBe('none');
      expect(resolveCaptureMode('none')).toBe('none');
      expect(resolveCaptureMode('NO_CONTENT')).toBe('none');
      expect(resolveCaptureMode('false')).toBe('none');
      expect(resolveCaptureMode('')).toBe('none');

      expect(resolveCaptureMode(true)).toBe('span_only');
      expect(resolveCaptureMode('span_only')).toBe('span_only');
      expect(resolveCaptureMode('SPAN_ONLY')).toBe('span_only');
      expect(resolveCaptureMode('span')).toBe('span_only');
      expect(resolveCaptureMode('TRUE')).toBe('span_only');
    });

    it('warns and falls back to none for unrecognized values', () => {
      const warnings: string[] = [];
      const mockDiag = { warn: (msg: string) => warnings.push(msg) } as any;
      expect(resolveCaptureMode('event_only', mockDiag)).toBe('none');
      expect(resolveCaptureMode(123, mockDiag)).toBe('none');
      expect(warnings.length).toBe(2);
    });
  });

  describe('getOpenAIErrorType', function () {
    it('extracts subclass constructor name when error.name is generic Error', () => {
      class RateLimitError extends Error {
        constructor(msg: string) {
          super(msg);
          this.name = 'Error';
        }
      }
      expect(getOpenAIErrorType(new RateLimitError('429 limit'))).toBe(
        'RateLimitError'
      );
    });

    it('falls back to error.name, error.code, or _OTHER', () => {
      const namedErr = new Error('boom');
      namedErr.name = 'CustomAuthError';
      expect(getOpenAIErrorType(namedErr)).toBe('CustomAuthError');

      const codedErr = Object.assign(new Error('network fail'), {
        code: 'ECONNRESET',
      });
      expect(getOpenAIErrorType(codedErr)).toBe('ECONNRESET');

      expect(getOpenAIErrorType(new Error('plain'))).toBe('Error');
      expect(getOpenAIErrorType('string error')).toBe('_OTHER');
      expect(getOpenAIErrorType(null)).toBe('_OTHER');
    });
  });

  describe('responseFormatToOutputType & parseJsonArguments', function () {
    it('maps OpenAI response_format / text.format to gen_ai.output.type', () => {
      expect(responseFormatToOutputType(undefined)).toBeUndefined();
      expect(responseFormatToOutputType(null)).toBeUndefined();
      expect(responseFormatToOutputType({})).toBeUndefined();
      expect(responseFormatToOutputType({ type: 'json_object' })).toBe('json');
      expect(responseFormatToOutputType({ type: 'json_schema' })).toBe('json');
      expect(responseFormatToOutputType({ type: 'text' })).toBe('text');
      expect(responseFormatToOutputType({ type: 'custom_xml' })).toBe(
        'custom_xml'
      );
    });

    it('parses valid JSON strings and preserves raw non-JSON strings', () => {
      expect(parseJsonArguments(undefined)).toBeUndefined();
      expect(parseJsonArguments('')).toBeUndefined();
      expect(parseJsonArguments('{"city":"Paris"}')).toEqual({ city: 'Paris' });
      expect(parseJsonArguments('{malformed')).toBe('{malformed');
    });
  });

  describe('parseUriOrBlobPart & inferEmbeddingDimensions', function () {
    it('parses https URLs into UriPart and data: base64 URIs into BlobPart', () => {
      expect(
        parseUriOrBlobPart('https://example.com/cat.png', 'image')
      ).toEqual({
        type: 'uri',
        modality: 'image',
        uri: 'https://example.com/cat.png',
      });

      const b64 = Buffer.from([1, 2, 3, 4]).toString('base64');
      const blobPart = parseUriOrBlobPart(
        `data:image/png;base64,${b64}`,
        'image'
      );
      expect(blobPart.type).toBe('blob');
      if (blobPart.type === 'blob') {
        expect(blobPart.modality).toBe('image');
        expect(blobPart.mime_type).toBe('image/png');
        expect(Array.from(blobPart.content)).toEqual([1, 2, 3, 4]);
      }

      // Non-base64 data URI falls back to UriPart
      expect(parseUriOrBlobPart('data:text/plain,hello', 'document')).toEqual({
        type: 'uri',
        modality: 'document',
        uri: 'data:text/plain,hello',
      });
    });

    it('infers embedding dimensions from float arrays and base64 float32 buffers', () => {
      expect(inferEmbeddingDimensions([0.1, 0.2, 0.3])).toBe(3);
      expect(inferEmbeddingDimensions([])).toBeUndefined();
      expect(inferEmbeddingDimensions(undefined)).toBeUndefined();

      const floatBuf = Buffer.alloc(16); // 4 float32 values
      expect(inferEmbeddingDimensions(floatBuf.toString('base64'))).toBe(4);
    });
  });

  describe('token usage & message mapping helpers', function () {
    it('extracts chat token usage including cache, reasoning, and audio modalities', () => {
      expect(extractChatTokenUsage(undefined)).toBeUndefined();
      expect(
        extractChatTokenUsage({
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_tokens_details: { cached_tokens: 0, audio_tokens: 0 },
          completion_tokens_details: { reasoning_tokens: 0, audio_tokens: 0 },
        })
      ).toEqual({
        inputTokenCount: 100,
        outputTokenCount: 50,
        reasoningTokenCount: undefined,
        cacheReadTokenCount: undefined,
        tokenUsageByModality: undefined,
      });

      expect(
        extractChatTokenUsage({
          prompt_tokens: 120,
          completion_tokens: 80,
          total_tokens: 200,
          prompt_tokens_details: { cached_tokens: 64, audio_tokens: 20 },
          completion_tokens_details: { reasoning_tokens: 30, audio_tokens: 10 },
        })
      ).toEqual({
        inputTokenCount: 120,
        outputTokenCount: 80,
        reasoningTokenCount: 30,
        cacheReadTokenCount: 64,
        tokenUsageByModality: {
          inputTokens: { audio: 20 },
          outputTokens: { audio: 10 },
        },
      });
    });

    it('extracts responses token usage', () => {
      expect(extractResponsesTokenUsage(null)).toBeUndefined();
      expect(
        extractResponsesTokenUsage({
          input_tokens: 40,
          output_tokens: 25,
          total_tokens: 65,
          input_tokens_details: { cached_tokens: 16, cache_write_tokens: 8 },
          output_tokens_details: { reasoning_tokens: 12 },
        })
      ).toEqual({
        inputTokenCount: 40,
        outputTokenCount: 25,
        reasoningTokenCount: 12,
        cacheReadTokenCount: 16,
        cacheWriteTokenCount: 8,
      });
    });

    it('normalizes chat finish reasons and maps multimodal/tool chat messages', () => {
      expect(normalizeChatFinishReason('stop')).toBe('stop');
      expect(normalizeChatFinishReason('tool_calls')).toBe('tool_call');
      expect(normalizeChatFinishReason('function_call')).toBe('tool_call');
      expect(normalizeChatFinishReason(null)).toBe('error');

      const inputMsgs = extractChatInputMessages([
        {
          role: 'user',
          name: 'alice',
          content: [
            { type: 'text', text: 'Inspect this' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/img.jpg' },
            },
            { type: 'file', file: { file_id: 'file-123' } },
          ],
        },
        {
          role: 'assistant',
          refusal: 'Cannot do that',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'lookup', arguments: '{"id":42}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: '{"ok":true}',
        },
      ]);

      expect(inputMsgs).toEqual([
        {
          role: 'user',
          name: 'alice',
          parts: [
            { type: 'text', content: 'Inspect this' },
            {
              type: 'uri',
              modality: 'image',
              uri: 'https://example.com/img.jpg',
            },
            { type: 'file', modality: 'document', file_id: 'file-123' },
          ],
        },
        {
          role: 'assistant',
          parts: [
            { type: 'refusal', refusal: 'Cannot do that' },
            {
              type: 'tool_call',
              id: 'call_1',
              name: 'lookup',
              arguments: { id: 42 },
            },
          ],
        },
        {
          role: 'tool',
          parts: [
            {
              type: 'tool_call_response',
              id: 'call_1',
              response: { ok: true },
            },
          ],
        },
      ]);

      const outputMsgs = extractChatOutputMessages([
        {
          index: 0,
          logprobs: null,
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            refusal: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{"id":42}' },
              },
            ],
          },
        },
      ]);
      expect(outputMsgs).toEqual([
        {
          role: 'assistant',
          finish_reason: 'tool_call',
          parts: [
            {
              type: 'tool_call',
              id: 'call_1',
              name: 'lookup',
              arguments: { id: 42 },
            },
          ],
        },
      ]);
    });

    it('converts Responses API input, output, conversation ID, compaction, and finish reasons', () => {
      expect(extractResponsesConversationId('conv_1')).toBe('conv_1');
      expect(extractResponsesConversationId({ id: 'conv_2' })).toBe('conv_2');
      expect(extractResponsesConversationId(null)).toBeUndefined();

      expect(extractResponsesSystemInstructions('Be concise.')).toEqual([
        { type: 'text', content: 'Be concise.' },
      ]);
      expect(extractResponsesSystemInstructions('   ')).toBeUndefined();

      expect(
        hasCompactionItems([{ type: 'message' }, { type: 'compaction' }])
      ).toBe(true);
      expect(hasCompactionItems('plain text')).toBe(false);

      expect(deriveResponsesFinishReason([], 'failed')).toBe('error');
      expect(
        deriveResponsesFinishReason([], 'incomplete', {
          reason: 'max_output_tokens',
        })
      ).toBe('length');
      expect(
        deriveResponsesFinishReason([], 'incomplete', {
          reason: 'content_filter',
        })
      ).toBe('content_filter');
      expect(
        deriveResponsesFinishReason(
          [{ type: 'compaction', id: 'cmp_1' } as any],
          'completed'
        )
      ).toBe('compaction');
      expect(
        deriveResponsesFinishReason(
          [
            {
              type: 'web_search_call',
              id: 'ws_1',
              status: 'completed',
            } as any,
          ],
          'completed'
        )
      ).toBe('stop');
      expect(
        deriveResponsesFinishReason(
          [
            {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'fn',
              arguments: '{}',
            } as any,
          ],
          'completed'
        )
      ).toBe('tool_call');

      const inputConverted = convertResponsesInputToMessages([
        { role: 'user', content: 'Hello' },
        { type: 'compaction', id: 'cmp_in', content: 'summary' } as any,
        { type: 'future_unknown_item', foo: 'bar' } as any,
      ]);
      expect(inputConverted).toEqual([
        { role: 'user', parts: [{ type: 'text', content: 'Hello' }] },
        {
          role: 'assistant',
          parts: [{ type: 'compaction', id: 'cmp_in', content: 'summary' }],
        },
        {
          role: 'user',
          parts: [{ type: 'future_unknown_item', foo: 'bar' }],
        },
      ]);

      const outputConverted = convertResponsesOutputToMessages(
        [
          {
            type: 'reasoning',
            id: 'rs_1',
            summary: [{ type: 'summary_text', text: 'Thought step' }],
          } as any,
          {
            type: 'web_search_call',
            id: 'ws_1',
            status: 'completed',
            action: { type: 'search', query: 'otel' },
          } as any,
          {
            type: 'message',
            id: 'msg_1',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Answer', annotations: [] }],
          } as any,
          {
            type: 'future_output_item',
            payload: 123,
          } as any,
        ],
        'stop'
      );
      expect(outputConverted).toEqual([
        {
          role: 'assistant',
          finish_reason: 'stop',
          parts: [
            { type: 'reasoning', content: 'Thought step' },
            {
              type: 'server_tool_call',
              id: 'ws_1',
              name: 'web_search_call',
              server_tool_call: {
                type: 'web_search_call',
                action: { type: 'search', query: 'otel' },
              },
            },
            { type: 'text', content: 'Answer' },
            { type: 'future_output_item', payload: 123 },
          ],
        },
      ]);
    });

    it('converts all Responses tool, server tool, multimodal, and reference item types', () => {
      expect(convertResponsesInputToMessages(undefined)).toEqual([]);
      expect(convertResponsesInputToMessages('Single prompt')).toEqual([
        { role: 'user', parts: [{ type: 'text', content: 'Single prompt' }] },
      ]);

      const allInputs = convertResponsesInputToMessages([
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Look at these' },
            { type: 'refusal', refusal: 'No' },
            { type: 'input_image', file_id: 'file_img_1', detail: 'auto' },
            {
              type: 'input_image',
              image_url: 'https://example.com/pic.jpg',
              detail: 'auto',
            },
            { type: 'input_image', detail: 'auto' },
            { type: 'input_file', file_id: 'file_doc_1' },
            {
              type: 'input_file',
              file_data: 'data:application/pdf;base64,QUJD',
            },
            { type: 'input_file', file_url: 'https://example.com/doc.pdf' },
            { type: 'input_file', filename: 'empty.pdf' },
            {
              type: 'input_audio',
              input_audio: { data: 'QUJD', format: 'mp3' },
            },
            { type: 'custom_part', extra: true },
          ],
        } as any,
        {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_fn_1',
          name: 'lookup',
          arguments: '{"q":"otel"}',
        } as any,
        {
          type: 'function_call_output',
          call_id: 'call_fn_1',
          output: '{"ok":true}',
        } as any,
        {
          type: 'custom_tool_call',
          id: 'ctc_1',
          call_id: 'call_custom_1',
          name: 'sql_runner',
          input: 'SELECT 1',
        } as any,
        {
          type: 'custom_tool_call_output',
          call_id: 'call_custom_1',
          output: '1 row',
        } as any,
        {
          type: 'reasoning',
          id: 'rs_in',
          summary: [{ type: 'summary_text', text: 'Sum' }],
          content: [{ type: 'reasoning_text', text: 'Full' }],
        } as any,
        {
          type: 'file_search_call',
          id: 'fs_1',
          queries: ['otel'],
          results: [{ file_id: 'f1', text: 'hit' }],
        } as any,
        {
          type: 'web_search_call',
          id: 'ws_in',
          action: { type: 'search', query: 'genai' },
        } as any,
        {
          type: 'code_interpreter_call',
          id: 'ci_1',
          code: 'print(42)',
          container_id: 'cntr_1',
          outputs: [{ type: 'logs', logs: '42' }],
        } as any,
        {
          type: 'image_generation_call',
          id: 'ig_1',
          result: 'base64img',
        } as any,
        {
          type: 'mcp_call',
          id: 'mcp_1',
          name: 'fetch_doc',
          server_label: 'docs',
          arguments: '{"id":1}',
          output: 'doc text',
        } as any,
        {
          type: 'mcp_call',
          id: 'mcp_err',
          name: 'fetch_doc',
          server_label: 'docs',
          arguments: '{}',
          error: 'timeout',
        } as any,
        {
          type: 'mcp_list_tools',
          id: 'mcpl_1',
          server_label: 'docs',
          tools: [{ name: 'fetch_doc' }],
        } as any,
        {
          type: 'mcp_approval_request',
          id: 'mcpa_1',
          name: 'delete_doc',
          server_label: 'docs',
          arguments: '{"id":2}',
        } as any,
        {
          type: 'mcp_approval_response',
          id: 'mcpar_1',
          approval_request_id: 'mcpa_1',
          approve: true,
        } as any,
        {
          type: 'computer_call',
          id: 'comp_1',
          call_id: 'call_comp_1',
          action: { type: 'click', x: 10, y: 20 },
        } as any,
        {
          type: 'computer_call_output',
          call_id: 'call_comp_1',
          output: { type: 'computer_screenshot', image_url: 'https://img' },
        } as any,
        {
          type: 'local_shell_call',
          id: 'sh_1',
          call_id: 'call_sh_1',
          action: { type: 'exec', command: ['echo', 'hi'] },
        } as any,
        {
          type: 'local_shell_call_output',
          id: 'call_sh_1',
          output: 'hi\n',
        } as any,
        {
          type: 'item_reference',
          id: 'item_ref_1',
        } as any,
      ]);

      expect(allInputs).toHaveLength(20);
      expect(allInputs[0].parts).toHaveLength(11);
      expect(allInputs[1].parts[0]).toEqual({
        type: 'tool_call',
        id: 'call_fn_1',
        name: 'lookup',
        arguments: { q: 'otel' },
      });
      expect(allInputs[2].parts[0]).toEqual({
        type: 'tool_call_response',
        id: 'call_fn_1',
        response: { ok: true },
      });
      expect(allInputs[19]).toEqual({
        role: 'assistant',
        parts: [{ type: 'item_reference', id: 'item_ref_1' }],
      });

      const allOutputs = convertResponsesOutputToMessages(
        [
          {
            type: 'function_call',
            id: 'fc_out',
            call_id: 'call_out_1',
            name: 'lookup',
            arguments: '{"q":"ts"}',
          } as any,
          {
            type: 'custom_tool_call',
            id: 'ctc_out',
            call_id: 'call_ctc_out',
            name: 'dsl',
            input: 'RUN',
          } as any,
          {
            type: 'compaction',
            id: 'cmp_out',
            content: 'compacted',
          } as any,
          {
            type: 'file_search_call',
            id: 'fs_out',
            queries: ['q'],
            results: [{ file_id: 'f1', text: 't' }],
          } as any,
          {
            type: 'code_interpreter_call',
            id: 'ci_out',
            code: '1+1',
            container_id: 'c1',
            outputs: [{ type: 'logs', logs: '2' }],
          } as any,
          {
            type: 'image_generation_call',
            id: 'ig_out',
            result: 'b64',
          } as any,
          {
            type: 'mcp_call',
            id: 'mcp_out',
            name: 'tool1',
            server_label: 'srv',
            arguments: '{}',
            output: 'ok',
          } as any,
          {
            type: 'mcp_list_tools',
            id: 'mcpl_out',
            server_label: 'srv',
            error: 'denied',
          } as any,
          {
            type: 'mcp_approval_request',
            id: 'mcpa_out',
            name: 'tool2',
            server_label: 'srv',
            arguments: '{}',
          } as any,
          {
            type: 'computer_call',
            id: 'comp_out',
            call_id: 'call_comp_out',
            action: { type: 'screenshot' },
          } as any,
          {
            type: 'local_shell_call',
            id: 'sh_out',
            call_id: 'call_sh_out',
            action: { type: 'exec', command: ['pwd'] },
          } as any,
        ],
        'tool_call'
      );

      expect(allOutputs).toHaveLength(1);
      expect(allOutputs[0].finish_reason).toBe('tool_call');
      expect(allOutputs[0].parts).toHaveLength(15);
    });
  });
});
