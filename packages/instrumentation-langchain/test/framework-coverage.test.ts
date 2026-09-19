/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import { expect } from 'expect';
import { context, trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import {
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { Embeddings } from '@langchain/core/embeddings';
import { Document } from '@langchain/core/documents';
import { VectorStore } from '@langchain/core/vectorstores';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import { HumanMessage, RemoveMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createAgent, createMiddleware } from 'langchain';
import { retrievalDocuments } from '../src/retrieval';
import { createGraphStreamAccumulator } from '../src/graph-stream';

class LocalEmbeddings extends Embeddings {
  constructor() {
    super({});
  }
  async embedQuery() {
    return [1, 0];
  }
  async embedDocuments(texts: string[]) {
    return texts.map((_, index) => (index === 0 ? [1, 0] : [0, 1]));
  }
}

async function memoryStore() {
  return MemoryVectorStore.fromDocuments(
    [
      new Document({
        id: 'doc-a',
        pageContent: 'private first document',
        metadata: { secret: 'private metadata' },
      }),
      new Document({ id: 'doc-b', pageContent: 'private second document' }),
    ],
    new LocalEmbeddings()
  );
}

const searches = {
  similarity: (store: MemoryVectorStore) => store.similaritySearch('query', 1),
  scores: (store: MemoryVectorStore) =>
    store.similaritySearchWithScore('query', 1),
  vector: (store: MemoryVectorStore) =>
    store.similaritySearchVectorWithScore([1, 0], 1),
  mmr: (store: MemoryVectorStore) =>
    store.maxMarginalRelevanceSearch('query', { k: 1 }),
  retriever: (store: MemoryVectorStore) =>
    store.asRetriever({ k: 1 }).invoke('query'),
  retrieverMmr: (store: MemoryVectorStore) =>
    store.asRetriever({ k: 1, searchType: 'mmr' }).invoke('query'),
};

const State = Annotation.Root({ text: Annotation<string> });
function graph() {
  return new StateGraph(State)
    .addNode('upper', state => ({ text: state.text.toUpperCase() }))
    .addEdge(START, 'upper')
    .addEdge('upper', END)
    .compile({ name: 'local-graph' });
}

class LocalChatModel extends FakeListChatModel {
  override bindTools() {
    return this;
  }
}

describe('LangChain owned framework coverage', function () {
  before(function () {
    if (Number(process.versions.node.split('.')[0]) < 20) this.skip();
  });
  beforeEach(() => {
    instrumentation.setConfig({ captureMessageContent: false });
    instrumentation.enable();
    resetMemoryExporter();
  });
  afterEach(() => instrumentation.disable());

  for (const capture of [false, true]) {
    for (const [name, search] of Object.entries(searches)) {
      it(`traces owned ${name} retrieval once (capture=${capture})`, async () => {
        instrumentation.setConfig({ captureMessageContent: capture });
        const result = await search(await memoryStore());
        expect(result).toHaveLength(1);
        const spans = getTestSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0].name).toBe('retrieval');
        expect(spans[0].kind).toBe(SpanKind.CLIENT);
        expect(spans[0].attributes).toMatchObject({
          'gen_ai.operation.name': 'retrieval',
          'gen_ai.retrieval.top_k': 1,
        });
        expect(spans[0].attributes['gen_ai.retrieval.query.text']).toBe(
          capture && name !== 'vector' ? 'query' : undefined
        );
        const documents = spans[0].attributes['gen_ai.retrieval.documents'];
        if (capture) {
          const expected =
            name === 'scores' || name === 'vector'
              ? [{ id: 'doc-a', score: 1 }]
              : [{ id: 'doc-a' }];
          expect(JSON.parse(String(documents))).toEqual(expected);
        } else {
          expect(documents).toBeUndefined();
        }
        expect(JSON.stringify(spans[0].attributes)).not.toContain('private');
        expect(spans[0].attributes['gen_ai.input.messages']).toBeUndefined();
        expect(spans[0].attributes['gen_ai.output.messages']).toBeUndefined();
      });
    }
  }

  it('preserves default counts, empty results and retrieval errors', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const store = await memoryStore();
    expect(
      await store.similaritySearch('query', undefined, () => false)
    ).toEqual([]);
    expect(getTestSpans()[0].attributes).toMatchObject({
      'gen_ai.retrieval.top_k': 4,
      'gen_ai.retrieval.documents': '[]',
    });
    const error = new TypeError('private retrieval failure');
    await expect(
      store.similaritySearch('query', 1, () => {
        throw error;
      })
    ).rejects.toBe(error);
    const failed = getTestSpans()[1];
    expect(failed.status).toEqual({ code: SpanStatusCode.ERROR });
    expect(failed.attributes['error.type']).toBe('TypeError');
    expect(failed.attributes['gen_ai.retrieval.documents']).toBeUndefined();
    expect(failed.events).toEqual([]);
  });

  it('retains retrieval callbacks, workflow parentage and stream results', async () => {
    const store = await memoryStore();
    let completed = 0;
    const retriever = store.asRetriever({ k: 1 });
    const workflow = RunnableSequence.from([
      RunnableLambda.from((input: string) => input),
      retriever,
    ]).withConfig({ runName: 'retrieval-chain' });
    const chunks = [];
    for await (const chunk of await workflow.stream('query', {
      callbacks: [
        {
          handleRetrieverEnd: () => {
            completed++;
          },
        },
      ],
    }))
      chunks.push(chunk);
    expect(chunks).toHaveLength(1);
    expect(chunks[0][0].id).toBe('doc-a');
    const spans = getTestSpans();
    expect(spans).toHaveLength(2);
    expect(spans[0].name).toBe('retrieval');
    expect(spans[0].parentSpanContext?.spanId).toBe(
      spans[1].spanContext().spanId
    );
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(completed).toBe(1);
  });

  for (const disabled of [false, true]) {
    it(`respects retrieval and graph ${disabled ? 'disable' : 'suppression'}`, async () => {
      const store = await memoryStore();
      if (disabled) instrumentation.disable();
      await context.with(
        disabled ? context.active() : suppressTracing(context.active()),
        async () => {
          await store.asRetriever().invoke('query');
          await graph().invoke({ text: 'hello' });
          for await (const chunk of await graph().stream({ text: 'hello' }))
            expect(chunk).toBeDefined();
        }
      );
      expect(getTestSpans()).toEqual([]);
    });
  }

  for (const streaming of [false, true]) {
    it(`traces direct configured graph workflows (stream=${streaming})`, async () => {
      instrumentation.setConfig({ captureMessageContent: true });
      const instance = graph().withConfig({
        runName: 'configured-graph',
        configurable: { thread_id: 'graph-thread' },
      });
      await trace.getTracer('test').startActiveSpan('parent', async parent => {
        try {
          if (streaming) {
            const chunks = [];
            for await (const chunk of await instance.stream(
              { text: 'hello' },
              { streamMode: 'values' }
            ))
              chunks.push(chunk);
            expect(chunks.at(-1)).toEqual({ text: 'HELLO' });
          } else {
            expect(await instance.invoke({ text: 'hello' })).toEqual({
              text: 'HELLO',
            });
          }
        } finally {
          parent.end();
        }
      });
      const spans = getTestSpans();
      expect(spans).toHaveLength(2);
      expect(spans[0].name).toBe('invoke_workflow configured-graph');
      expect(spans[0].parentSpanContext?.spanId).toBe(
        spans[1].spanContext().spanId
      );
      expect(spans[0].attributes['gen_ai.conversation.id']).toBe(
        'graph-thread'
      );
      expect(spans[0].attributes['gen_ai.output.messages']).toBeUndefined();
    });
  }

  it('captures the final graph message state rather than concatenating snapshots', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const MessageState = Annotation.Root({
      input: Annotation<string>,
      output: Annotation<string>,
    });
    const instance = new StateGraph(MessageState)
      .addNode('upper', state => ({ output: state.input.toUpperCase() }))
      .addEdge(START, 'upper')
      .addEdge('upper', END)
      .compile({ name: 'message-graph' });
    for await (const chunk of await instance.stream(
      { input: 'hello' },
      { streamMode: 'values' }
    ))
      expect(chunk).toBeDefined();
    const span = getTestSpans()[0];
    expect(
      JSON.parse(String(span.attributes['gen_ai.output.messages']))
    ).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'HELLO' }] },
    ]);
  });

  it('captures each graph own namespace across three levels of subgraphs', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const OutputState = Annotation.Root({ output: Annotation<string> });
    const leaf = new StateGraph(OutputState)
      .addNode('finish', () => ({ output: 'leaf result' }))
      .addEdge(START, 'finish')
      .addEdge('finish', END)
      .compile({ name: 'namespace-leaf' });
    const child = new StateGraph(OutputState)
      .addNode('leaf', leaf)
      .addNode('finish', () => ({ output: 'child result' }))
      .addEdge(START, 'leaf')
      .addEdge('leaf', 'finish')
      .addEdge('finish', END)
      .compile({ name: 'namespace-child' });
    const parent = new StateGraph(OutputState)
      .addNode('callChild', async state => {
        let output = state;
        for await (const [namespace, snapshot] of await child.stream(state, {
          streamMode: 'values',
          subgraphs: true,
        })) {
          if (namespace.length === 1) output = snapshot;
        }
        expect(output.output).toBe('child result');
        return output;
      })
      .addNode('finish', () => ({ output: 'parent result' }))
      .addEdge(START, 'callChild')
      .addEdge('callChild', 'finish')
      .addEdge('finish', END)
      .compile({ name: 'namespace-parent' });
    const depths = new Set<number>();
    for await (const [namespace] of await parent.stream(
      { output: 'input' },
      {
        streamMode: ['updates', 'values'],
        subgraphs: true,
        configurable: { checkpoint_ns: 'reset-by-sdk-at-root' },
      }
    ))
      depths.add(namespace.length);
    expect([...depths]).toEqual(expect.arrayContaining([1, 2]));
    const spans = getTestSpans();
    expect(spans).toHaveLength(3);
    for (const name of ['leaf', 'child', 'parent']) {
      const span = spans.find(
        span => span.name === `invoke_workflow namespace-${name}`
      );
      expect(span?.attributes['gen_ai.output.messages']).toBe(
        JSON.stringify([
          {
            role: 'assistant',
            parts: [{ type: 'text', content: `${name} result` }],
          },
        ])
      );
    }
  });

  it('preserves graph errors and ends early-cancelled streams without output', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const error = new TypeError('private graph failure');
    const failing = new StateGraph(State)
      .addNode('fail', () => {
        throw error;
      })
      .addEdge(START, 'fail')
      .addEdge('fail', END)
      .compile({ name: 'failing' });
    await expect(failing.invoke({ text: 'hello' })).rejects.toBe(error);
    expect(getTestSpans()[0].attributes['error.type']).toBe('TypeError');
    const reader = (await graph().stream({ text: 'hello' })).getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel();
    const spans = getTestSpans();
    expect(spans).toHaveLength(2);
    expect(spans[1].attributes['gen_ai.output.messages']).toBeUndefined();
  });

  it('keeps nested application graphs and excludes internal node adapters', async () => {
    const inner = graph();
    const outer = new StateGraph(State)
      .addNode('inner', inner)
      .addEdge(START, 'inner')
      .addEdge('inner', END)
      .compile({ name: 'outer-graph' });
    expect(await outer.invoke({ text: 'hello' })).toEqual({ text: 'HELLO' });
    const spans = getTestSpans();
    expect(spans.map(span => span.name)).toEqual([
      'invoke_workflow local-graph',
      'invoke_workflow outer-graph',
    ]);
    expect(spans[0].parentSpanContext?.spanId).toBe(
      spans[1].spanContext().spanId
    );
  });

  it('captures complete graph snapshots without replaying update reducers', () => {
    const values = createGraphStreamAccumulator(
      { streamMode: ['updates', 'values'], subgraphs: true },
      ['values']
    );
    values.add([[], 'values', { text: 'first' }]);
    values.add([['child'], 'values', { text: 'child state' }]);
    values.add([[], 'updates', { node: { text: 'delta' } }]);
    expect(values.output()).toEqual({ text: 'first' });
    values.add([[], 'values', { text: 'final' }]);
    expect(values.output()).toEqual({ text: 'final' });
    const updates = createGraphStreamAccumulator({ streamMode: 'updates' }, []);
    updates.add({ node: { text: 'delta' } });
    expect(updates.output()).toBeUndefined();
    const encoded = createGraphStreamAccumulator(
      { encoding: 'text/event-stream' },
      ['values']
    );
    encoded.add(new Uint8Array());
    expect(encoded.output()).toBeUndefined();
  });

  it('replaces early descendant snapshots when the own namespace arrives', () => {
    const namespace = ['parent:task', 'child:task'];
    for (const configured of [false, true]) {
      const accumulator = createGraphStreamAccumulator(
        {
          streamMode: ['updates', 'values'],
          subgraphs: true,
          configurable: configured
            ? { checkpoint_ns: namespace.join('|') }
            : {},
        },
        []
      );
      accumulator.add([
        [...namespace, 'leaf:task'],
        'values',
        { output: 'leaf initial' },
      ]);
      accumulator.add([namespace, 'updates', {}]);
      expect(accumulator.output()).toBeUndefined();
      accumulator.add([namespace, 'values', { output: 'child final' }]);
      accumulator.add([
        [...namespace, 'leaf:task'],
        'values',
        { output: 'leaf final' },
      ]);
      expect(accumulator.output()).toEqual({ output: 'child final' });
    }
  });

  it('accepts legacy empty root namespaces and snapshot metadata', () => {
    for (const streamMode of ['values', ['updates', 'values']]) {
      for (const checkpoint_ns of [undefined, 'reset-by-sdk-at-root']) {
        const accumulator = createGraphStreamAccumulator(
          { streamMode, subgraphs: true, configurable: { checkpoint_ns } },
          []
        );
        const wrap = (namespace: string[], output: string) =>
          Array.isArray(streamMode)
            ? [
                namespace,
                'values',
                { output },
                { checkpoint: { id: 'checkpoint', step: 1, source: 'loop' } },
              ]
            : [namespace, { output }];
        accumulator.add(wrap(['child:task'], 'child initial'));
        accumulator.add(wrap([''], 'parent result'));
        accumulator.add(wrap(['child:task'], 'child final'));
        expect(accumulator.output()).toEqual({ output: 'parent result' });
      }
    }
  });

  it('rejects malformed retrieval output without inventing documents', () => {
    expect(() => retrievalDocuments(null)).toThrow(TypeError);
    expect(() => retrievalDocuments([null])).toThrow(TypeError);
    expect(retrievalDocuments([[{ id: 'doc' }, NaN]])).toBe('[{"id":"doc"}]');
  });

  it('does not instrument delegated vector store implementations', async () => {
    class ProviderStore extends VectorStore {
      _vectorstoreType() {
        return 'test-provider';
      }
      async addDocuments() {}
      async addVectors() {}
      async similaritySearchVectorWithScore(): Promise<[Document, number][]> {
        return [
          [new Document({ id: 'provider-doc', pageContent: 'answer' }), 1],
        ];
      }
    }
    const store = new ProviderStore(new LocalEmbeddings(), {});
    expect((await store.asRetriever().invoke('query'))[0].id).toBe(
      'provider-doc'
    );
    expect(getTestSpans()).toEqual([]);
  });

  it('retains graph defaults when optional invocation fields are undefined', async () => {
    const configured = graph().withConfig({
      runName: 'default-name',
      configurable: { thread_id: 'default-thread' },
    });
    await configured.invoke({ text: 'hello' }, { runName: undefined });
    expect(getTestSpans()[0].name).toBe('invoke_workflow default-name');
    expect(getTestSpans()[0].attributes['gen_ai.conversation.id']).toBe(
      'default-thread'
    );
  });

  it('preserves donor metadata-alias precedence and ignores unrelated metadata', async () => {
    const flow = RunnableSequence.from([
      RunnableLambda.from((value: string) => value),
      RunnableLambda.from((value: string) => value),
    ]);
    await flow.invoke('input', {
      metadata: {
        session_id: 'session',
        thread_id: 'thread',
        conversation_id: 'conversation',
        unrelated: 'private metadata',
      },
    });
    await flow.invoke('input', { metadata: { unrelated: 'private metadata' } });
    expect(getTestSpans()[0].attributes['gen_ai.conversation.id']).toBe(
      'session'
    );
    expect(
      getTestSpans()[1].attributes['gen_ai.conversation.id']
    ).toBeUndefined();
    expect(
      JSON.stringify(getTestSpans().map(span => span.attributes))
    ).not.toContain('private metadata');
  });

  it('preserves legacy function-call content at a public workflow boundary', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    const flow = RunnableSequence.from([
      RunnableLambda.from((value: unknown) => value),
      RunnableLambda.from((value: unknown) => value),
    ]);
    const message = {
      role: 'assistant',
      content: '',
      additional_kwargs: {
        function_call: { name: 'echo', args: '{"text":"answer"}' },
      },
    };
    await flow.invoke([message]);
    for (const key of ['gen_ai.input.messages', 'gen_ai.output.messages']) {
      expect(
        JSON.parse(String(getTestSpans()[0].attributes[key]))[0].parts[1]
      ).toEqual({
        type: 'tool_call',
        name: 'echo',
        arguments: { text: 'answer' },
      });
    }
  });

  for (const capture of [false, true]) {
    it(`captures public prompt values and string message arrays (capture=${capture})`, async () => {
      instrumentation.setConfig({ captureMessageContent: capture });
      const flow = RunnableSequence.from([
        RunnableLambda.from((input: unknown) => input),
        new FakeListChatModel({ responses: ['answer'] }),
      ]);
      for (const [input, expected] of [
        [
          await PromptTemplate.fromTemplate('Question: {question}').invoke({
            question: 'hello',
          }),
          ['Question: hello'],
        ],
        [
          await ChatPromptTemplate.fromMessages([
            ['human', 'Question: {question}'],
          ]).invoke({ question: 'hello' }),
          ['Question: hello'],
        ],
        [
          ['human', 'question'],
          ['human', 'question'],
        ],
        [[['human', 'question']], ['question']],
        [
          ['first', new HumanMessage('second'), ['human', 'third']],
          ['first', 'second', 'third'],
        ],
      ] as const) {
        resetMemoryExporter();
        expect((await flow.invoke(input)).content).toBe('answer');
        const spans = getTestSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0].attributes['gen_ai.input.messages']).toBe(
          capture
            ? JSON.stringify(
                expected.map(content => ({
                  role: 'user',
                  parts: [{ type: 'text', content }],
                }))
              )
            : undefined
        );
        if (!capture)
          expect(spans[0].attributes['gen_ai.output.messages']).toBeUndefined();
      }
    });
  }

  it('omits output removed by afterAgent for both invoke and values streams', async () => {
    instrumentation.setConfig({ captureMessageContent: true });
    for (const streaming of [false, true]) {
      resetMemoryExporter();
      const agent = createAgent({
        model: new LocalChatModel({ responses: ['answer'] }),
        tools: [],
        middleware: [
          createMiddleware({
            name: 'redact-output',
            afterAgent: state => ({
              messages: state.messages.map((message: BaseMessage) => {
                if (!message.id) throw new Error('Missing SDK message ID');
                return new RemoveMessage({ id: message.id });
              }),
            }),
          }),
        ],
      });
      const input = { messages: [new HumanMessage('question')] };
      if (streaming) {
        const snapshots = [];
        for await (const snapshot of await agent.stream(input, {
          streamMode: 'values',
        }))
          snapshots.push(snapshot.messages.map(message => message.content));
        expect(snapshots).toEqual([['question'], ['question', 'answer'], []]);
      } else {
        expect((await agent.invoke(input)).messages).toEqual([]);
      }
      expect(getTestSpans()).toHaveLength(1);
      expect(
        getTestSpans()[0].attributes['gen_ai.output.messages']
      ).toBeUndefined();
    }
  });
});
