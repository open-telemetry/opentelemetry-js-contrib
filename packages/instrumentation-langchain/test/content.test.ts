/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'expect';
import { diag } from '@opentelemetry/api';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import {
  agentOutput,
  messages,
  systemInstructions,
  toolContent,
} from '../src/content';

describe('LangChain content mapping', () => {
  const convert = (value: unknown) => JSON.parse(messages(value, diag)!);

  it('preserves all message roles and tuple inputs', () => {
    expect(
      convert([
        ['system', 'system'],
        ['developer', 'developer'],
        ['human', 'user'],
        ['ai', 'assistant'],
        { role: 'custom', content: 'custom' },
      ]).map((message: { role: string }) => message.role)
    ).toEqual(['system', 'developer', 'user', 'assistant', 'custom']);
  });

  it('maps text, reasoning, URIs, inline data and uploaded files', () => {
    const parts = convert([
      new HumanMessage({
        content: [
          { type: 'text', text: 'generated text' },
          { type: 'thinking', thinking: 'generated reasoning' },
          { type: 'reasoning', reasoning: 'more reasoning' },
          {
            type: 'image_url',
            image_url: { url: 'https://example.test/image.png' },
          },
          { type: 'image', url: 'https://example.test/image.png' },
          { type: 'audio', base64: 'AAAA', mime_type: 'audio/wav' },
          { type: 'video', url: 'https://example.test/video.mp4' },
          {
            type: 'file',
            fileId: 'generated-file',
            mime_type: 'application/pdf',
          },
        ],
      }),
    ])[0].parts;
    expect(parts).toEqual([
      { type: 'text', content: 'generated text' },
      { type: 'reasoning', content: 'generated reasoning' },
      { type: 'reasoning', content: 'more reasoning' },
      { type: 'uri', modality: 'image', uri: 'https://example.test/image.png' },
      { type: 'uri', modality: 'image', uri: 'https://example.test/image.png' },
      {
        type: 'blob',
        modality: 'audio',
        content: 'AAAA',
        mime_type: 'audio/wav',
      },
      { type: 'uri', modality: 'video', uri: 'https://example.test/video.mp4' },
      {
        type: 'file',
        modality: 'document',
        file_id: 'generated-file',
        mime_type: 'application/pdf',
      },
    ]);
  });

  it('preserves unsupported parts, refusals and provider-specific citations', () => {
    const content = [
      { type: 'refusal', refusal: 'generated refusal' },
      { type: 'citation', document_id: 'generated-document' },
      { type: 'custom_provider_part', data: 'generated data' },
    ];
    expect(convert([{ role: 'assistant', content }])[0].parts).toEqual(content);
  });

  it('distinguishes server-hosted tools from client tool calls', () => {
    const content = [
      {
        type: 'server_tool_call',
        id: 'server-call',
        name: 'search',
        args: { query: 'test' },
      },
      {
        type: 'server_tool_result',
        tool_call_id: 'server-call',
        output: 'test result',
      },
    ];
    expect(convert([{ role: 'assistant', content }])[0].parts).toEqual([
      {
        type: 'server_tool_call',
        id: 'server-call',
        name: 'search',
        server_tool_call: { ...content[0], type: 'search' },
      },
      {
        type: 'server_tool_call_response',
        id: 'server-call',
        server_tool_call_response: content[1],
      },
    ]);
  });

  it('rewrites legacy function.arguments and additional_kwargs tool calls', () => {
    for (const additional_kwargs of [
      { function_call: { name: 'echo', arguments: '{"text":"test"}' } },
      {
        tool_calls: [
          { function: { name: 'echo', arguments: '{"text":"test"}' } },
        ],
      },
    ]) {
      expect(
        convert([{ role: 'assistant', content: '', additional_kwargs }])[0]
          .parts[1]
      ).toEqual({
        type: 'tool_call',
        name: 'echo',
        arguments: { text: 'test' },
      });
    }
  });

  it('does not duplicate tool calls represented in both content and tool_calls', () => {
    expect(
      convert([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_call',
              id: 'call',
              name: 'echo',
              args: { text: 'test' },
            },
          ],
          tool_calls: [{ id: 'call', name: 'echo', args: { text: 'test' } }],
        },
      ])[0].parts
    ).toEqual([
      {
        type: 'tool_call',
        id: 'call',
        name: 'echo',
        arguments: { text: 'test' },
      },
    ]);
  });

  it('preserves malformed tool arguments and invalid calls instead of dropping them', () => {
    expect(
      convert([
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            { id: 'call', function: { name: 'echo', arguments: '{bad json' } },
          ],
          invalid_tool_calls: [
            { name: 'broken', args: '{', error: 'generated error' },
          ],
        },
      ])[0].parts
    ).toEqual([
      { type: 'text', content: '' },
      { type: 'tool_call', id: 'call', name: 'echo', arguments: '{bad json' },
      {
        type: 'invalid_tool_call',
        name: 'broken',
        args: '{',
        error: 'generated error',
      },
    ]);
  });

  it('does not fabricate messages from arbitrary chain state', () => {
    expect(messages(undefined, diag)).toBeUndefined();
    expect(messages({ arbitrary: 'state' }, diag)).toBeUndefined();
    expect(messages([null, {}, 1], diag)).toBeUndefined();
  });

  it('extracts final agent output without recapturing input history', () => {
    const answer = new AIMessage('answer');
    expect(
      agentOutput({ messages: [new HumanMessage('question'), answer] })
    ).toEqual([answer]);
    expect(agentOutput({ model: { messages: [answer] } })).toEqual([answer]);
    expect(agentOutput({ unrelated: true })).toBeUndefined();
  });

  it('maps string and SDK system-message instruction shapes', () => {
    for (const value of [
      'generated instruction',
      new SystemMessage('generated instruction'),
    ]) {
      expect(JSON.parse(systemInstructions(value, diag)!)).toEqual([
        { type: 'text', content: 'generated instruction' },
      ]);
    }
    expect(systemInstructions(undefined, diag)).toBeUndefined();
    expect(
      JSON.parse(
        systemInstructions(
          new SystemMessage({
            content: [{ type: 'text', text: 'generated instruction' }],
          }),
          diag
        )!
      )
    ).toEqual([{ type: 'text', content: 'generated instruction' }]);
  });

  it('produces object-shaped tool content for every supported value', () => {
    for (const value of ['text', 42, false, null, ['array']]) {
      expect(JSON.parse(toolContent(value)!)).toEqual({ content: value });
    }
    expect(JSON.parse(toolContent('{"key":"value"}')!)).toEqual({
      key: 'value',
    });
    expect(toolContent(undefined)).toBeUndefined();
  });
});
