/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('node:assert/strict');
const { exporter, provider } = require('./register.cjs');

module.exports = async function exercise({
  RunnableSequence,
  RunnableLambda,
  DynamicTool,
  FakeListChatModel,
  createAgent,
  Annotation,
  StateGraph,
  START,
  END,
  MemoryVectorStore,
  Embeddings,
}) {
  const workflow = RunnableSequence.from([
    RunnableLambda.from(input => input.toUpperCase()),
    RunnableLambda.from(input => `${input}!`),
  ]).withConfig({ runName: 'fixture-workflow' });
  assert.equal(await workflow.invoke('test'), 'TEST!');
  const stream = await workflow.stream('stream');
  assert.ok(stream instanceof ReadableStream);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(chunks.join(''), 'STREAM!');

  const tool = new DynamicTool({
    name: 'fixture-tool',
    description: 'Generated local echo tool',
    func: async input => input,
  });
  assert.equal(await tool.invoke('test'), 'test');

  if (StateGraph) {
    class LocalEmbeddings extends Embeddings {
      constructor() {
        super({});
      }
      async embedQuery() {
        return [1, 0];
      }
      async embedDocuments(texts) {
        return texts.map((_, index) => (index === 0 ? [1, 0] : [0, 1]));
      }
    }
    const store = await MemoryVectorStore.fromDocuments(
      [
        {
          id: 'fixture-document',
          pageContent: 'private fixture document',
          metadata: { secret: 'private fixture metadata' },
        },
        {
          id: 'other-document',
          pageContent: 'other private fixture document',
          metadata: {},
        },
      ],
      new LocalEmbeddings()
    );
    const scored = await store.similaritySearchWithScore('direct query', 1);
    assert.equal(scored.length, 1);
    assert.equal(scored[0][0].id, 'fixture-document');
    assert.equal(scored[0][1], 1);
    const retriever = store.asRetriever({ k: 1 });
    const documents = await retriever.invoke('retriever query');
    assert.equal(documents.length, 1);
    assert.equal(documents[0].id, 'fixture-document');

    const State = Annotation.Root({
      text: Annotation(),
      documentId: Annotation(),
    });
    const graph = new StateGraph(State)
      .addNode('retrieve', async state => {
        const found = await retriever.invoke(state.text);
        assert.equal(found.length, 1);
        return { documentId: found[0].id };
      })
      .addNode('upper', state => ({ text: state.text.toUpperCase() }))
      .addEdge(START, 'retrieve')
      .addEdge('retrieve', 'upper')
      .addEdge('upper', END)
      .compile({ name: 'fixture-graph' });
    assert.deepEqual(await graph.invoke({ text: 'graph query' }), {
      text: 'GRAPH QUERY',
      documentId: 'fixture-document',
    });
    const states = [];
    const graphStream = await graph.stream(
      { text: 'stream graph query' },
      { streamMode: 'values' }
    );
    assert.ok(graphStream instanceof ReadableStream);
    for await (const state of graphStream) states.push(state);
    assert.deepEqual(states.at(-1), {
      text: 'STREAM GRAPH QUERY',
      documentId: 'fixture-document',
    });
  }

  if (createAgent) {
    class LocalChatModel extends FakeListChatModel {
      bindTools() {
        return this;
      }
    }
    const agent = createAgent({
      name: 'fixture-agent',
      model: new LocalChatModel({ responses: ['generated answer'] }),
      tools: [],
    });
    const result = await agent.invoke({
      messages: [{ role: 'user', content: 'generated prompt' }],
    });
    assert.equal(result.messages.at(-1).content, 'generated answer');
    const [first, sibling] = (
      await agent.stream({
        messages: [{ role: 'user', content: 'generated prompt' }],
      })
    ).tee();
    const reader = first.pipeThrough(new TransformStream()).getReader();
    while (!(await reader.read()).done) {}
    await provider.forceFlush();
    const agentSpans = exporter
      .getFinishedSpans()
      .filter(span => span.name === 'invoke_agent fixture-agent');
    await sibling.cancel();
    assert.equal(agentSpans.length, 2);
    const [encoded, encodedSibling] = (
      await agent.stream(
        { messages: [{ role: 'user', content: 'generated prompt' }] },
        { encoding: 'text/event-stream' }
      )
    ).tee();
    const encodedReader = encoded
      .pipeThrough(new TransformStream())
      .getReader();
    while (!(await encodedReader.read()).done) {}
    await provider.forceFlush();
    const encodedAgentSpans = exporter
      .getFinishedSpans()
      .filter(span => span.name === 'invoke_agent fixture-agent');
    await encodedSibling.cancel();
    assert.equal(encodedAgentSpans.length, 3);
  }
  await provider.forceFlush();
  const spans = exporter.getFinishedSpans();
  assert.deepEqual(
    spans.map(span => span.name).sort(),
    [
      'execute_tool fixture-tool',
      ...(createAgent
        ? [
            'invoke_agent fixture-agent',
            'invoke_agent fixture-agent',
            'invoke_agent fixture-agent',
          ]
        : []),
      'invoke_workflow fixture-workflow',
      'invoke_workflow fixture-workflow',
      ...(StateGraph
        ? [
            'invoke_workflow fixture-graph',
            'invoke_workflow fixture-graph',
            'retrieval',
            'retrieval',
            'retrieval',
            'retrieval',
          ]
        : []),
    ].sort()
  );
  if (StateGraph) {
    const graphSpans = spans.filter(
      span => span.name === 'invoke_workflow fixture-graph'
    );
    const retrievalSpans = spans.filter(span => span.name === 'retrieval');
    assert.equal(graphSpans.length, 2);
    assert.equal(retrievalSpans.length, 4);
    for (const span of graphSpans) {
      assert.equal(span.attributes['gen_ai.operation.name'], 'invoke_workflow');
      assert.equal(span.attributes['gen_ai.workflow.name'], 'fixture-graph');
      assert.equal(span.parentSpanContext, undefined);
    }
    assert.deepEqual(
      retrievalSpans.map(
        span => span.attributes['gen_ai.retrieval.query.text']
      ),
      ['direct query', 'retriever query', 'graph query', 'stream graph query']
    );
    for (const [index, span] of retrievalSpans.entries()) {
      assert.equal(span.attributes['gen_ai.operation.name'], 'retrieval');
      assert.equal(span.attributes['gen_ai.retrieval.top_k'], 1);
      assert.deepEqual(
        JSON.parse(span.attributes['gen_ai.retrieval.documents']),
        [
          index === 0
            ? { id: 'fixture-document', score: 1 }
            : { id: 'fixture-document' },
        ]
      );
      assert.equal(JSON.stringify(span.attributes).includes('private'), false);
      assert.equal(
        span.parentSpanContext?.spanId,
        index < 2 ? undefined : graphSpans[index - 2].spanContext().spanId
      );
    }
  }
  if (createAgent) {
    assert.deepEqual(
      JSON.parse(
        spans.find(span => span.name === 'invoke_agent fixture-agent')
          .attributes['gen_ai.output.messages']
      ),
      [
        {
          role: 'assistant',
          parts: [{ type: 'text', content: 'generated answer' }],
        },
      ]
    );
  }
  await provider.shutdown();
  console.log('LangChain fixture passed');
};
