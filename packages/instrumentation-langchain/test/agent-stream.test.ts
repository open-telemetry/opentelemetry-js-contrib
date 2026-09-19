/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api';
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { expect } from 'expect';
import { createAgentStreamAccumulator } from '../src/agent-stream';
import { agentOutput, messages } from '../src/content';

describe('LangChain agent stream accumulation', () => {
  const metadata = { langgraph_node: 'model', langgraph_step: 1 };
  const request = new AIMessage({
    id: 'request',
    content: '',
    tool_calls: [{ id: 'call', name: 'echo', args: { text: 'answer' } }],
  });
  const tool = new ToolMessage({
    id: 'tool',
    content: 'answer',
    tool_call_id: 'call',
  });
  const answer = new AIMessage({ id: 'answer', content: 'answer' });
  const convert = (value: unknown) =>
    JSON.parse(messages(agentOutput(value), diag, 'assistant')!);

  it('keeps the latest relevant default update, including returnDirect tools', () => {
    const accumulator = createAgentStreamAccumulator();
    accumulator.add({ model: { messages: [request] } });
    accumulator.add({ tools: { messages: [tool] } });
    accumulator.add({ middleware: { messages: [] } });
    accumulator.add({ unrelated: { state: true } });
    expect(accumulator.output()).toEqual([tool]);
    expect(convert(accumulator.output())).toEqual([
      {
        role: 'tool',
        parts: [{ type: 'tool_call_response', id: 'call', response: 'answer' }],
      },
    ]);
  });

  it('replaces previous updates from the same node instead of merging histories', () => {
    const accumulator = createAgentStreamAccumulator({ streamMode: 'updates' });
    accumulator.add({ model: { messages: [request] } });
    accumulator.add({ tools: { messages: [tool] } });
    accumulator.add({ model: { messages: [answer] } });
    expect(accumulator.output()).toEqual([answer]);
  });

  it('extracts only the final response from values, never the input history', () => {
    const accumulator = createAgentStreamAccumulator({ streamMode: 'values' });
    const input = new HumanMessage('question');
    accumulator.add({ messages: [input] });
    expect(accumulator.output()).toBeUndefined();
    accumulator.add({ messages: [input, request, tool] });
    expect(accumulator.output()).toEqual([tool]);
    accumulator.add({ messages: [input, request, tool, answer] });
    expect(accumulator.output()).toEqual([answer]);
  });

  it('combines real SDK message chunks into one final assistant message', () => {
    const accumulator = createAgentStreamAccumulator({
      streamMode: 'messages',
    });
    for (const content of 'answer') {
      accumulator.add([
        new AIMessageChunk({ id: 'answer', content }),
        metadata,
      ]);
    }
    const output = accumulator.output() as AIMessageChunk[];
    expect(output).toHaveLength(1);
    expect(output[0]).toBeInstanceOf(AIMessageChunk);
    expect(output[0].id).toBe('answer');
    expect(convert(output)).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'answer' }] },
    ]);
  });

  it('uses SDK concatenation for streamed tool-call argument fragments', () => {
    const accumulator = createAgentStreamAccumulator({
      streamMode: 'messages',
    });
    for (const [index, args] of ['{"text":', '"answer"}'].entries()) {
      accumulator.add([
        new AIMessageChunk({
          id: 'request',
          content: '',
          tool_call_chunks: [
            {
              index: 0,
              ...(index === 0 ? { id: 'call', name: 'echo' } : {}),
              args,
            },
          ],
        }),
        metadata,
      ]);
    }
    const output = accumulator.output() as AIMessageChunk[];
    expect(output[0].tool_calls).toEqual([
      { id: 'call', name: 'echo', args: { text: 'answer' }, type: 'tool_call' },
    ]);
  });

  it('groups interleaved deltas by message ID rather than by their node', () => {
    const accumulator = createAgentStreamAccumulator({
      streamMode: 'messages',
    });
    for (const [id, content] of [
      ['first', 'old'],
      ['second', 'ans'],
      ['first', ' response'],
      ['second', 'wer'],
    ]) {
      accumulator.add([new AIMessageChunk({ id, content }), metadata]);
    }
    const output = accumulator.output() as AIMessageChunk[];
    expect(output).toHaveLength(1);
    expect(output[0].id).toBe('second');
    expect(output[0].content).toBe('answer');
  });

  it('combines chunks with missing IDs before or after the identified chunk', () => {
    for (const ids of [
      ['answer', undefined, undefined],
      [undefined, 'answer', undefined],
      [undefined, undefined, 'answer'],
      [undefined, undefined, undefined],
    ]) {
      const accumulator = createAgentStreamAccumulator({
        streamMode: 'messages',
      });
      for (const [index, content] of ['an', 'sw', 'er'].entries()) {
        accumulator.add([
          new AIMessageChunk({ content, id: ids[index] }),
          metadata,
        ]);
      }
      expect(convert(accumulator.output())).toEqual([
        { role: 'assistant', parts: [{ type: 'text', content: 'answer' }] },
      ]);
    }
  });

  it('separates anonymous messages from different model steps', () => {
    const accumulator = createAgentStreamAccumulator({
      streamMode: 'messages',
    });
    for (const [step, content] of [
      [1, 'old'],
      [2, 'ans'],
      [2, 'wer'],
    ] as const) {
      accumulator.add([
        new AIMessageChunk(content),
        { ...metadata, langgraph_step: step },
      ]);
    }
    expect(convert(accumulator.output())).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'answer' }] },
    ]);
  });

  it('does not merge full SDK messages with the chunks they replace', () => {
    const accumulator = createAgentStreamAccumulator({
      streamMode: 'messages',
    });
    accumulator.add([
      new AIMessageChunk({ id: 'answer', content: 'ans' }),
      metadata,
    ]);
    accumulator.add([answer, metadata]);
    expect(accumulator.output()).toEqual([answer]);
    accumulator.add([tool, { langgraph_node: 'tools', langgraph_step: 2 }]);
    expect(accumulator.output()).toEqual([tool]);
  });

  it('prefers complete updates over duplicate messages in multiple stream modes', () => {
    for (const snapshotFirst of [false, true]) {
      const accumulator = createAgentStreamAccumulator({
        streamMode: ['messages', 'updates', 'values'],
      });
      const update = ['updates', { model: { messages: [answer] } }];
      if (snapshotFirst) accumulator.add(update);
      for (const content of 'answer') {
        accumulator.add([
          'messages',
          [new AIMessageChunk({ id: 'answer', content }), metadata],
        ]);
      }
      if (!snapshotFirst) accumulator.add(update);
      accumulator.add([
        'values',
        { messages: [new HumanMessage('question'), answer] },
      ]);
      expect(accumulator.output()).toEqual([answer]);
      expect(convert(accumulator.output())).toEqual([
        { role: 'assistant', parts: [{ type: 'text', content: 'answer' }] },
      ]);
    }
  });

  it('lets empty and non-output values replace snapshots and token deltas', () => {
    for (const retained of [[], [new HumanMessage('question')]]) {
      const accumulator = createAgentStreamAccumulator({
        streamMode: ['messages', 'updates', 'values'],
        subgraphs: true,
      });
      accumulator.add([[], 'updates', { model: { messages: [answer] } }]);
      accumulator.add([[], 'values', { messages: retained }]);
      accumulator.add([['child:task'], 'values', { messages: [answer] }]);
      accumulator.add([
        [],
        'messages',
        [new AIMessageChunk({ id: 'answer', content: 'answer' }), metadata],
      ]);
      accumulator.add([[], 'updates', { middleware: { messages: [] } }]);
      expect(accumulator.output()).toBeUndefined();

      accumulator.add([[], 'values', { messages: [answer] }]);
      accumulator.add([['child:task'], 'values', { messages: [] }]);
      expect(accumulator.output()).toEqual([answer]);
    }
  });

  it('keeps returnDirect output with simultaneous messages and updates', () => {
    const accumulator = createAgentStreamAccumulator({
      streamMode: ['updates', 'messages'],
    });
    accumulator.add(['messages', [request, metadata]]);
    accumulator.add(['updates', { model: { messages: [request] } }]);
    accumulator.add(['messages', [tool, { langgraph_node: 'tools' }]]);
    accumulator.add(['updates', { tools: { messages: [tool] } }]);
    expect(accumulator.output()).toEqual([tool]);
  });

  it('unwraps single-mode and multimode subgraph envelopes', () => {
    for (const streamMode of ['updates', ['updates', 'messages']]) {
      const accumulator = createAgentStreamAccumulator({
        streamMode,
        subgraphs: true,
      });
      const wrap = (namespace: string[], payload: unknown) =>
        Array.isArray(streamMode)
          ? [namespace, 'updates', payload]
          : [namespace, payload];
      accumulator.add(wrap(['child:task'], { model: { messages: [request] } }));
      accumulator.add(wrap([], { tools: { messages: [tool] } }));
      accumulator.add(wrap(['child:task'], { model: { messages: [answer] } }));
      expect(accumulator.output()).toEqual([tool]);
    }
  });

  it('does not combine chunks from distinct subgraphs with the same message ID', () => {
    const accumulator = createAgentStreamAccumulator({
      streamMode: ['messages'],
      subgraphs: true,
    });
    for (const [namespace, content] of [
      ['first:task', 'old'],
      ['second:task', 'ans'],
      ['second:task', 'wer'],
    ]) {
      accumulator.add([
        [namespace],
        'messages',
        [new AIMessageChunk({ id: 'shared', content }), metadata],
      ]);
    }
    expect(convert(accumulator.output())).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'answer' }] },
    ]);
  });

  it('unwraps single-mode message chunks in subgraphs', () => {
    const accumulator = createAgentStreamAccumulator({
      streamMode: 'messages',
      subgraphs: true,
    });
    for (const content of ['ans', 'wer']) {
      accumulator.add([
        ['child:task'],
        [new AIMessageChunk({ id: 'answer', content }), metadata],
      ]);
    }
    expect(convert(accumulator.output())).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'answer' }] },
    ]);
  });

  it('infers supported bare payloads when no streamMode is supplied', () => {
    for (const chunk of [
      { model: { messages: [answer] } },
      { messages: [new HumanMessage('question'), answer] },
      [answer, metadata],
      ['messages', [answer, metadata]],
    ]) {
      const accumulator = createAgentStreamAccumulator();
      accumulator.add(chunk);
      expect(accumulator.output()).toEqual([answer]);
    }
  });

  it('ignores unrelated modes and empty or malformed chunks', () => {
    const accumulator = createAgentStreamAccumulator();
    for (const chunk of [
      undefined,
      null,
      [],
      {},
      { unrelated: true },
      { model: { messages: [] } },
      ['custom', { messages: [answer] }],
      ['debug', { model: { messages: [answer] } }],
    ]) {
      accumulator.add(chunk);
    }
    expect(accumulator.output()).toBeUndefined();
    const custom = createAgentStreamAccumulator({ streamMode: 'custom' });
    custom.add({ messages: [answer] });
    expect(custom.output()).toBeUndefined();
  });
});
