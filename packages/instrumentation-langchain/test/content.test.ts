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
  ToolMessage,
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

  it('maps inline image URLs to blobs in every supported image shape', () => {
    for (const [url, content] of [
      ['data:image/png;base64,aGVsbG8=', 'aGVsbG8='],
      ['data:IMAGE/PNG;BASE64,aGVsbG8', 'aGVsbG8'],
      ['data:image/png;charset=utf-8;base64,%2B%2F8%3D', '+/8='],
      ['data:image/png;base64,', ''],
    ]) {
      for (const image of [
        { type: 'image_url', image_url: url },
        { type: 'image_url', image_url: { url, detail: 'low' } },
        { type: 'image', url },
      ]) {
        expect(
          convert([new HumanMessage({ content: [image] })])[0].parts
        ).toEqual([
          { type: 'blob', modality: 'image', mime_type: 'image/png', content },
        ]);
      }
    }
  });

  it('preserves unknown or malformed inline image URLs without discarding them', () => {
    for (const url of [
      'data:image/png,not-base64',
      'data:text/plain;base64,aGVsbG8=',
      'data:image/png;base64,not base64',
      'data:image/png;base64,A',
      'data:image/png;base64,AA=',
      'data:image/png;base64,AAAA====',
      'data:image/png;base64,%ZZ',
      'data:image/png;name=%ZZ;base64,AAAA',
      'data:image/png;base64,AAAA\n',
      'data:image/png;base64,AAAA%0A',
      'data:image/png;unknown;base64,AAAA',
      'data:image/png;base64;extra=1,AAAA',
      undefined,
      42,
    ]) {
      const content = [
        { type: 'image_url', image_url: url },
        { type: 'image_url', image_url: { url } },
        { type: 'image', url },
      ];
      expect(convert([{ role: 'user', content }])[0].parts).toEqual(
        JSON.parse(JSON.stringify(content))
      );
    }
  });

  it('keeps the MIME type of non-PNG inline images', () => {
    expect(
      convert([
        {
          role: 'user',
          content: [{ type: 'image', url: 'data:image/svg+xml;base64,AAAA' }],
        },
      ])[0].parts
    ).toEqual([
      {
        type: 'blob',
        modality: 'image',
        mime_type: 'image/svg+xml',
        content: 'AAAA',
      },
    ]);
  });

  it('keeps genuine image URL strings as URIs', () => {
    expect(
      convert([
        new HumanMessage({
          content: [
            {
              type: 'image_url',
              image_url: 'https://example.test/image.png',
            },
          ],
        }),
      ])[0].parts
    ).toEqual([
      { type: 'uri', modality: 'image', uri: 'https://example.test/image.png' },
    ]);
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
    expect(messages([], diag)).toBeUndefined();
    expect(messages({ messages: [] }, diag)).toBeUndefined();
  });

  it('preserves valid messages among malformed input and output entries', () => {
    const valid = new AIMessage('answer');
    for (const role of ['user', 'assistant']) {
      expect(
        JSON.parse(messages([null, 1, {}, valid, false], diag, role)!)
      ).toEqual([
        { role: 'assistant', parts: [{ type: 'text', content: 'answer' }] },
      ]);
    }
  });

  it('supports legacy function args and ignores malformed call envelopes', () => {
    expect(
      convert([
        {
          role: 'assistant',
          content: '',
          additional_kwargs: {
            function_call: { name: 'echo', args: '{"text":"test"}' },
          },
        },
      ])[0].parts[1]
    ).toEqual({
      type: 'tool_call',
      name: 'echo',
      arguments: { text: 'test' },
    });
    for (const additional_kwargs of [
      undefined,
      null,
      1,
      { function_call: null },
      { function_call: 'invalid' },
    ]) {
      expect(
        convert([
          { role: 'assistant', content: 'answer', additional_kwargs },
        ])[0].parts
      ).toEqual([{ type: 'text', content: 'answer' }]);
    }
  });

  it('extracts final agent output without recapturing input history', () => {
    const answer = new AIMessage('answer');
    expect(
      agentOutput({ messages: [new HumanMessage('question'), answer] })
    ).toEqual([answer]);
    expect(agentOutput({ model: { messages: [answer] } })).toEqual([answer]);
    expect(agentOutput({ unrelated: true })).toBeUndefined();
  });

  it('extracts the last relevant node update for returnDirect tools', () => {
    const request = new AIMessage({
      content: '',
      tool_calls: [{ id: 'call', name: 'echo', args: { text: 'answer' } }],
    });
    const answer = new ToolMessage({ content: 'answer', tool_call_id: 'call' });
    expect(
      agentOutput({
        model: { messages: [request] },
        tools: { messages: [answer] },
        middleware: { messages: [] },
        unrelated: { state: true },
      })
    ).toEqual([answer]);
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
