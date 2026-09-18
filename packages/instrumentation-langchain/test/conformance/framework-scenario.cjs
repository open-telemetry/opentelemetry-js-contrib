/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict';

const assert = require('node:assert/strict');
const { configureTelemetry, loadLangChain } = require('./scenario.cjs');

async function main() {
  const name = process.argv[2];
  const telemetry = configureTelemetry(
    name.endsWith('_off') || name === 'scoped_suppression' ? 'off' : 'config'
  );
  const lc = loadLangChain();
  const {
    MemoryVectorStore,
  } = require('@langchain/classic/vectorstores/memory');
  const {
    Annotation,
    END,
    START,
    StateGraph,
  } = require('@langchain/langgraph');
  const { context } = require('@opentelemetry/api');
  const { suppressTracing } = require('@opentelemetry/core');
  const { IterableReadableStream } = require('@langchain/core/utils/stream');
  try {
    if (name.startsWith('retrieval_')) {
      const store = await MemoryVectorStore.fromDocuments(
        [{ id: 'doc-1', pageContent: 'synthetic document', metadata: {} }],
        {
          embedDocuments: async texts => texts.map(() => [1, 0]),
          embedQuery: async () => [1, 0],
        }
      );
      if (name === 'retrieval_error') {
        const error = new TypeError('synthetic retrieval failure');
        await assert.rejects(
          store.similaritySearch('query', 1, () => {
            throw error;
          }),
          actual => actual === error
        );
      } else if (name === 'retrieval_mmr') {
        assert.equal(
          (
            await store.asRetriever({ k: 1, searchType: 'mmr' }).invoke('query')
          )[0].id,
          'doc-1'
        );
      } else {
        const result = await store.similaritySearchWithScore('query', 1);
        assert.equal(result[0][0].id, 'doc-1');
        assert.equal(result[0][1], 1);
      }
    } else if (name.startsWith('graph_')) {
      const State = Annotation.Root({
        input: Annotation(),
        output: Annotation(),
      });
      const error = new TypeError('synthetic graph failure');
      const graph = new StateGraph(State)
        .addNode('answer', () => {
          if (name === 'graph_error') throw error;
          return { output: 'answer' };
        })
        .addEdge(START, 'answer')
        .addEdge('answer', END)
        .compile({ name: 'conformance-graph' })
        .withConfig({ configurable: { thread_id: 'graph-thread' } });
      if (name === 'graph_error') {
        await assert.rejects(
          graph.invoke({ input: 'question' }),
          actual => actual === error
        );
      } else if (name === 'graph_stream' || name === 'graph_updates') {
        const stream = await graph.stream(
          { input: 'question' },
          { streamMode: name === 'graph_updates' ? 'updates' : 'values' }
        );
        let chunks = 0;
        for await (const chunk of stream) {
          assert(chunk);
          chunks++;
        }
        assert(chunks > 0);
      } else {
        assert.equal(
          (await graph.invoke({ input: 'question' })).output,
          'answer'
        );
      }
    } else if (name === 'nested_workflow_stream') {
      const identity = lc.RunnableLambda.from(input => input);
      const inner = lc.RunnableSequence.from([identity, identity]).withConfig({
        runName: 'inner',
      });
      const outer = lc.RunnableSequence.from([identity, inner]).withConfig({
        runName: 'outer',
      });
      for await (const chunk of await outer.stream('question'))
        assert.equal(chunk, 'question');
    } else if (name === 'scoped_suppression') {
      const tool = new lc.DynamicTool({
        name: 'suppressed-tool',
        description: 'Synthetic test',
        func: async input => input,
      });
      const flow = lc.RunnableSequence.from([
        lc.RunnableLambda.from(input => input),
        lc.RunnableLambda.from(async input => {
          await context.with(suppressTracing(context.active()), async () => {
            const stream = IterableReadableStream.fromAsyncGenerator(
              (async function* () {
                yield await tool.invoke(input);
              })()
            );
            for await (const value of stream) assert.equal(value, input);
          });
          return input;
        }),
      ]).withConfig({ runName: 'scoped-suppression' });
      for await (const value of await flow.stream('question'))
        assert.equal(value, 'question');
    } else if (name === 'agent_estimated_usage') {
      class EstimatedModel extends lc.DeterministicChatModel {
        async _generate() {
          const result = await super._generate();
          result.generations[0].message.usage_metadata = undefined;
          result.llmOutput = {
            estimatedTokenUsage: { promptTokens: 7, completionTokens: 3 },
          };
          return result;
        }
      }
      const agent = lc.createAgent({
        name: 'estimated-agent',
        model: new EstimatedModel(),
        tools: [],
      });
      const result = await agent.invoke({ messages: [['user', 'question']] });
      assert.equal(result.messages.at(-1).content, 'generated answer');
    } else if (name === 'agent_structured_output') {
      const { providerStrategy } = require('langchain');
      class StructuredModel extends lc.DeterministicChatModel {
        async _generate() {
          const text = '{"answer":"generated answer"}';
          const result = await super._generate();
          result.generations[0].text = text;
          result.generations[0].message.content = text;
          return result;
        }
      }
      const agent = lc.createAgent({
        name: 'structured-agent',
        model: new StructuredModel(),
        tools: [],
        responseFormat: providerStrategy({
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
        }),
      });
      const result = await agent.invoke({ messages: [['user', 'question']] });
      assert.deepEqual(result.structuredResponse, {
        answer: 'generated answer',
      });
    } else if (name === 'agent_configured' || name === 'agent_dynamic_model') {
      const initial = new lc.DeterministicChatModel();
      initial.model = 'initial-model';
      let selectedCalls = 0;
      class SelectedModel extends lc.DeterministicChatModel {
        async _generate() {
          selectedCalls++;
          return super._generate();
        }
      }
      const selected = new SelectedModel();
      selected.model = 'selected-model';
      const agent = lc
        .createAgent({
          name: 'configured-agent',
          description: 'Synthetic conformance agent.',
          model: initial,
          tools: [],
          middleware:
            name === 'agent_dynamic_model'
              ? [
                  {
                    name: 'SelectModel',
                    wrapModelCall: (request, handler) =>
                      handler({ ...request, model: selected }),
                  },
                ]
              : [],
        })
        .withConfig({ configurable: { thread_id: 'configured-thread' } });
      assert.equal(
        (await agent.invoke({ messages: [['user', 'question']] })).messages.at(
          -1
        ).content,
        'generated answer'
      );
      if (name === 'agent_dynamic_model') assert.equal(selectedCalls, 1);
    } else {
      throw new Error(`Unknown framework scenario: ${name}`);
    }
    await telemetry.provider.forceFlush();
  } finally {
    await telemetry.provider.shutdown();
    telemetry.contextManager.disable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
