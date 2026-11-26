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
  ChatPromptValue,
  StringPromptValue,
} from '@langchain/core/prompt_values';
import * as sinon from 'sinon';
import {
  messages,
  parseInputMessages,
  parseOutputMessages,
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

  it('normalizes SDK prompt values through their chat-message contract', () => {
    for (const prompt of [
      new StringPromptValue('question'),
      new ChatPromptValue([new HumanMessage('question')]),
    ]) {
      for (const value of [prompt, { input: prompt }, { output: prompt }]) {
        expect(convert(value)).toEqual([
          { role: 'user', parts: [{ type: 'text', content: 'question' }] },
        ]);
      }
    }
  });

  it('treats strings in message arrays as human messages, not outer tuples', () => {
    for (const defaultRole of ['user', 'assistant']) {
      expect(
        JSON.parse(messages(['human', 'question'], diag, defaultRole)!)
      ).toEqual(
        ['human', 'question'].map(content => ({
          role: 'user',
          parts: [{ type: 'text', content }],
        }))
      );
      expect(
        JSON.parse(
          messages(
            ['question', ['ai', 'answer'], new SystemMessage('instructions')],
            diag,
            defaultRole
          )!
        ).map((message: { role: string }) => message.role)
      ).toEqual(['user', 'assistant', 'system']);
    }
    expect(convert([['human', 'question']])).toEqual([
      { role: 'user', parts: [{ type: 'text', content: 'question' }] },
    ]);
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
      ['data:IMAGE/PNG;BASE64,aGVsbG8', 'aGVsbG8='],
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

  it('omits malformed image data URLs with content-free diagnostics', () => {
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
    ]) {
      const debug = sinon.spy();
      const logger = { ...diag, debug };
      const content = [
        { type: 'image_url', image_url: url },
        { type: 'image_url', image_url: { url } },
        { type: 'image', url },
      ];
      expect(
        JSON.parse(messages([{ role: 'user', content }], logger)!)[0].parts
      ).toEqual([]);
      expect(debug.callCount).toBe(3);
      for (const args of debug.args)
        expect(args).toEqual([
          expect.stringMatching(
            /^LangChain: omitting invalid (base64 content|image data URL)$/
          ),
        ]);
    }
  });

  it('preserves unrecognized image fields as provider-specific parts', () => {
    for (const url of [undefined, 42]) {
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

  it('prefers standard camelCase server tool result IDs over legacy aliases', () => {
    const content = [
      {
        type: 'server_tool_call' as const,
        id: 'server-call',
        name: 'search',
        args: { query: 'test' },
      },
      {
        type: 'server_tool_call_result' as const,
        toolCallId: 'server-call',
        tool_call_id: 'legacy-call',
        status: 'success' as const,
        output: { answer: 'test result' },
      },
    ];
    // The content fallback also exercises SDK versions before contentBlocks.
    const fields = { content, contentBlocks: content };
    for (const value of [
      new AIMessage(fields),
      [{ role: 'assistant', content }],
    ]) {
      expect(
        convert(value)[0].parts.map((part: { id: string }) => part.id)
      ).toEqual(['server-call', 'server-call']);
    }
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
    expect(messages({ value: 'not a prompt value' }, diag)).toBeUndefined();
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

  it('returns normalized input and output messages without serializing them', () => {
    const input = parseInputMessages('question', diag);
    const output = parseOutputMessages('answer', diag);
    expect(input).toEqual([
      { role: 'user', parts: [{ type: 'text', content: 'question' }] },
    ]);
    expect(output).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'answer' }] },
    ]);
    expect(JSON.stringify(input)).toBe(messages('question', diag));
    expect(JSON.stringify(output)).toBe(messages('answer', diag, 'assistant'));
    expect(parseOutputMessages(['question'], diag)).toEqual(input);
    expect(messages('instruction', diag, 'developer')).toBe(
      '[{"role":"developer","parts":[{"type":"text","content":"instruction"}]}]'
    );
  });

  it('normalizes SDK tool responses without changing their content envelope', () => {
    for (const content of [
      'result',
      [{ type: 'text' as const, text: 'result' }],
    ]) {
      expect(
        convert(new ToolMessage({ content, tool_call_id: 'call' }))
      ).toEqual([
        {
          role: 'tool',
          parts: [
            { type: 'tool_call_response', id: 'call', response: content },
          ],
        },
      ]);
    }
  });

  it('decodes SDK base64 to bytes before canonical serialization', () => {
    for (const [content, canonical, bytes] of [
      ['aGVsbG8=', 'aGVsbG8=', [104, 101, 108, 108, 111]],
      ['aGVsbG8', 'aGVsbG8=', [104, 101, 108, 108, 111]],
      ['AA==', 'AA==', [0]],
      ['AA', 'AA==', [0]],
      ['AAA=', 'AAA=', [0, 0]],
      ['AAA', 'AAA=', [0, 0]],
      ['+/8=', '+/8=', [251, 255]],
      ['', '', []],
    ] as const) {
      for (const type of ['image', 'audio', 'video', 'file']) {
        const part = { type, base64: content };
        const expected = {
          type: 'blob',
          modality: type === 'file' ? 'document' : type,
          content: canonical,
        };
        for (const parsed of [
          parseInputMessages([{ role: 'user', content: [part] }], diag)?.[0]
            .parts,
          parseOutputMessages(
            [{ role: 'assistant', content: [part] }],
            diag
          )?.[0].parts,
        ]) {
          expect(parsed).toHaveLength(1);
          expect(parsed![0].content).toBeInstanceOf(Uint8Array);
          expect(parsed![0].content).toEqual(Buffer.from(bytes));
        }
        for (const role of ['user', 'assistant']) {
          expect(
            JSON.parse(messages([{ role, content: [part] }], diag, role)!)[0]
              .parts
          ).toEqual([expected]);
        }
      }
    }
  });

  it('omits invalid SDK base64 rather than passing it through as a blob or unknown part', () => {
    for (const base64 of [
      'A',
      'AAAAA',
      'AA=',
      'AAAA=',
      'AAAA====',
      '=AAA',
      'AA==AA==',
      'A-A_',
      'AA$A',
      'AA A',
      'AAAA\n',
      ' AAAA',
      'AAAA ',
      'AA%3D%3D',
      'AB==',
      'AAB=',
      'AB',
      'AAB',
      null,
      42,
      new Uint8Array([0]),
    ]) {
      for (const type of ['image', 'audio', 'video', 'file']) {
        const debug = sinon.spy();
        const logger = { ...diag, debug };
        const content = [
          { type: 'text', text: 'retained' },
          { type, base64 },
          { type: 'custom', value: 'retained' },
        ];
        const expected = [
          { type: 'text', content: 'retained' },
          { type: 'custom', value: 'retained' },
        ];
        for (const role of ['user', 'assistant']) {
          expect(
            JSON.parse(messages([{ role, content }], logger, role)!)[0].parts
          ).toEqual(expected);
        }
        expect(
          debug.withArgs('LangChain: omitting invalid base64 content').callCount
        ).toBe(2);
        for (const args of debug.args) {
          expect(args).toHaveLength(1);
          expect(args[0]).toMatch(
            /^LangChain: (omitting invalid base64 content|preserving an unmapped message part)$/
          );
        }
      }
    }
  });

  it('retains complete 4 MiB binary payloads and sibling text on input and output paths', function () {
    this.timeout(15000);
    const bytes = Buffer.alloc(4 * 1024 * 1024);
    for (let index = 0; index < bytes.length; index++)
      bytes[index] = index % 251;
    const encoded = bytes.toString('base64');
    const debug = sinon.spy();
    const logger = { ...diag, debug };
    for (const image of [
      { type: 'image', base64: encoded },
      { type: 'image_url', image_url: `data:image/png;base64,${encoded}` },
    ]) {
      const content = [{ type: 'text', text: 'retained text' }, image];
      for (const [parsed, formatted] of [
        [
          parseInputMessages([{ role: 'user', content }], logger)?.[0].parts,
          messages([{ role: 'user', content }], logger),
        ],
        [
          parseOutputMessages([{ role: 'assistant', content }], logger)?.[0]
            .parts,
          messages([{ role: 'assistant', content }], logger, 'assistant'),
        ],
      ] as const) {
        expect(parsed).toHaveLength(2);
        expect(parsed![0]).toEqual({ type: 'text', content: 'retained text' });
        const binary = parsed![1].content;
        expect(binary instanceof Uint8Array).toBe(true);
        if (!(binary instanceof Uint8Array))
          throw new Error('Expected binary content');
        expect(Buffer.compare(Buffer.from(binary), bytes)).toBe(0);
        const json = JSON.parse(formatted!);
        const parts = json[0].parts;
        expect(parts[0]).toEqual({ type: 'text', content: 'retained text' });
        expect(parts[1].content.length).toBe(encoded.length);
        expect(parts[1].content === encoded).toBe(true);
      }
    }
    expect(debug.called).toBe(false);
  });

  it('serializes raw blob views without including bytes outside the view', () => {
    const bytes = new Uint8Array([255, 0, 1, 2, 255]);
    for (const content of [
      bytes.subarray(1, 4),
      Buffer.from(bytes).subarray(1, 4),
    ]) {
      const part = { type: 'blob', modality: 'image', content };
      const expected = { ...part, content: 'AAEC' };
      for (const role of ['user', 'assistant']) {
        expect(
          JSON.parse(messages([{ role, content: [part] }], diag, role)!)[0]
            .parts
        ).toEqual([expected]);
      }
    }
  });

  it('rejects string-valued standardized blobs without the unknown-part escape hatch', () => {
    const debug = sinon.spy();
    const logger = { ...diag, debug };
    for (const content of ['AA==', 'private invalid encoding', null, {}]) {
      const part = { type: 'blob', modality: 'image', content };
      expect(
        parseInputMessages([{ role: 'user', content: [part] }], logger)![0]
          .parts
      ).toEqual([]);
    }
    expect(debug.callCount).toBe(4);
    for (const args of debug.args)
      expect(args).toEqual(['LangChain: omitting invalid binary blob content']);
  });

  it('preserves untyped and scalar content parts', () => {
    expect(
      convert([{ role: 'user', content: [null, 42, { value: 'unknown' }] }])[0]
        .parts
    ).toEqual([
      { type: 'text', content: 'null' },
      { type: 'text', content: '42' },
      { type: 'unknown', value: 'unknown' },
    ]);
  });

  it('reports SDK normalization failures without throwing', () => {
    const debug = sinon.spy();
    const logger = { ...diag, debug };
    const error = new Error('invalid SDK value');
    const prompt = {
      toChatMessages: () => {
        throw error;
      },
    };
    expect(parseInputMessages(prompt, logger)).toBeUndefined();
    expect(
      debug.calledWithExactly('LangChain: failed to normalize messages')
    ).toBe(true);
  });

  it('reports serialization failures instead of returning success-shaped content', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    for (const value of [
      circular,
      BigInt(42),
      {
        toJSON: () => {
          throw new Error('invalid JSON');
        },
      },
    ]) {
      const debug = sinon.spy();
      const logger = { ...diag, debug };
      for (const role of ['user', 'assistant']) {
        expect(
          messages(
            [{ role, content: [{ type: 'custom', value }] }],
            logger,
            role
          )
        ).toBeUndefined();
      }
      expect(debug.calledWith('LangChain: failed to serialize messages')).toBe(
        true
      );
    }
  });
});
