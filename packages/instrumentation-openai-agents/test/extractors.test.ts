/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import {
  extractAgentTools,
  extractGenerationTelemetry,
  extractResponseTelemetry,
} from '../src/extractors';

describe('OpenAI Agents telemetry extractors', () => {
  describe('extractGenerationTelemetry', () => {
    it('extracts model, requestOptions, and finishReasons while skipping messages when captureContent is false', () => {
      const result = extractGenerationTelemetry(
        {
          type: 'generation',
          model: 'gpt-4o',
          model_config: {
            temperature: 0.4,
            top_p: 0.9,
            max_tokens: 256,
            frequency_penalty: 0.1,
            presence_penalty: 0.2,
          },
          input: [{ role: 'user', content: 'secret' }],
          output: [
            {
              choices: [
                {
                  finish_reason: 'tool_calls',
                  message: { role: 'assistant', content: 'secret reply' },
                },
              ],
            },
          ],
        },
        false
      );

      assert.strictEqual(result.requestModel, 'gpt-4o');
      assert.deepStrictEqual(result.requestOptions, {
        temperature: 0.4,
        topP: 0.9,
        maxTokens: 256,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
      });
      assert.deepStrictEqual(result.finishReasons, ['tool_calls']);
      assert.strictEqual(result.inputMessages, undefined);
      assert.strictEqual(result.outputMessages, undefined);
      assert.strictEqual(result.systemInstructions, undefined);
    });

    it('converts system/developer messages, tool calls, tool responses, and malformed JSON args when captureContent is true', () => {
      const result = extractGenerationTelemetry(
        {
          type: 'generation',
          input: [
            { role: 'developer', content: 'Be terse.' },
            { role: 'user', content: 'Check order' },
            {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  function: { name: 'lookup', arguments: '{not-json' },
                },
              ],
            },
            { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
          ],
          output: [
            {
              choices: [
                {
                  finish_reason: 'stop',
                  message: {
                    role: 'assistant',
                    content: null,
                    refusal: 'Cannot do that',
                  },
                },
              ],
            },
          ],
        },
        true
      );

      assert.deepStrictEqual(result.systemInstructions, [
        { type: 'text', content: 'Be terse.' },
      ]);
      assert.deepStrictEqual(result.inputMessages, [
        { role: 'user', parts: [{ type: 'text', content: 'Check order' }] },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'call_1',
              name: 'lookup',
              arguments: '{not-json',
            },
          ],
        },
        {
          role: 'tool',
          parts: [
            {
              type: 'tool_call_response',
              id: 'call_1',
              response: '{"ok":true}',
            },
          ],
        },
      ]);
      assert.deepStrictEqual(result.outputMessages, [
        {
          role: 'assistant',
          parts: [{ type: 'refusal', refusal: 'Cannot do that' }],
        },
      ]);
    });
  });

  describe('extractResponseTelemetry', () => {
    it('omits requestOptions when no numeric params are present and extracts reasoning + tool items', () => {
      const result = extractResponseTelemetry(
        {
          type: 'response',
          _input: [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'Solve it' },
            {
              type: 'function_call',
              callId: 'c1',
              name: 'lookup',
              arguments: '{"k":"v"}',
            },
            { type: 'function_call_result', callId: 'c1', output: '42' },
          ],
          _response: {
            model: 'gpt-4o-2024-08-06',
            output: [
              {
                type: 'reasoning',
                summary: [{ text: 'Thinking step' }],
              },
              {
                type: 'function_call',
                call_id: 'c2',
                name: 'calc',
                arguments: '{"x":1}',
              },
            ],
          },
        },
        true
      );

      assert.strictEqual(result.responseModel, 'gpt-4o-2024-08-06');
      assert.strictEqual(result.requestModel, undefined);
      assert.strictEqual(result.requestOptions, undefined);
      assert.deepStrictEqual(result.systemInstructions, [
        { type: 'text', content: 'System prompt' },
      ]);
      assert.deepStrictEqual(result.inputMessages, [
        { role: 'user', parts: [{ type: 'text', content: 'Solve it' }] },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'c1',
              name: 'lookup',
              arguments: { k: 'v' },
            },
          ],
        },
        {
          role: 'tool',
          parts: [{ type: 'tool_call_response', id: 'c1', response: '42' }],
        },
      ]);
      assert.deepStrictEqual(result.outputMessages, [
        {
          role: 'assistant',
          parts: [{ type: 'reasoning', content: 'Thinking step' }],
        },
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool_call',
              id: 'c2',
              name: 'calc',
              arguments: { x: 1 },
            },
          ],
        },
      ]);
    });
  });

  describe('extractAgentTools', () => {
    it('extracts descriptions and definitions in one pass and skips unnamed tools', () => {
      const { toolDescriptions, toolDefinitions } = extractAgentTools([
        {
          type: 'function',
          name: 'get_weather',
          description: 'Weather lookup',
          parameters: { type: 'object' },
        },
        { name: '   ' },
        null,
      ]);

      assert.strictEqual(toolDescriptions.get('get_weather'), 'Weather lookup');
      assert.strictEqual(toolDescriptions.size, 1);
      assert.deepStrictEqual(toolDefinitions, [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Weather lookup',
          parameters: { type: 'object' },
        },
      ]);
    });
  });
});
