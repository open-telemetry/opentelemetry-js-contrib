/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getTestSpans,
  registerInstrumentationTesting,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { expect } from 'expect';
import {
  ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RETRIEVAL_DOCUMENTS,
  ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT,
  ATTR_GEN_AI_RETRIEVAL_TOP_K,
  ATTR_GEN_AI_WORKFLOW_NAME,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW,
  GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
  LlamaIndexInstrumentation,
  isPatched,
} from '../src';
import {
  formatInputMessages,
  formatOutputMessages,
  isContentCaptureEnabled,
  isEmbeddingPrototype,
  isRetrieverPrototype,
} from '../src/utils';

class MockRetrieverQueryEngine {
  retriever?: MockRetriever;

  constructor(retriever?: MockRetriever) {
    this.retriever = retriever;
  }

  async query(params: { query: string; stream?: boolean } | string) {
    const q = typeof params === 'string' ? params : params.query;
    if (this.retriever) {
      await this.retriever.retrieve(q);
    }
    return { response: `Response to: ${q}` };
  }

  // Also has retrieve to verify it is NOT double-wrapped
  async retrieve(_params: unknown) {
    return [{ node: { id_: 'qe-doc' } }];
  }
}

class MockStreamingQueryEngine {
  async query(params: { query: string; stream?: boolean }) {
    const q = params.query;
    async function* generateStream() {
      yield { delta: `Chunk 1 for ${q}. ` };
      yield { delta: `Chunk 2 for ${q}.` };
    }
    return generateStream();
  }
}

class MockRetriever {
  topK?: number | { text: number };

  constructor(topK?: number | { text: number }) {
    this.topK = topK;
  }

  async retrieve(_params: { query: string; topK?: number } | string) {
    return [
      {
        node: {
          id_: 'doc-1',
          getContent: () => 'Sample text 1',
          metadata: { file: 'test1.txt' },
        },
        score: 0.95,
      },
      {
        node: {
          id_: 'doc-2',
          getContent: () => 'Sample text 2',
          metadata: { file: 'test2.txt' },
        },
        score: 0.88,
      },
    ];
  }
}

class MockEmbedding {
  model = 'text-embedding-3-small';
  dimensions = 4;

  async getQueryEmbedding(_query: string) {
    return [0.12, -0.34, 0.56, 0.78];
  }
}

class MockEmbeddingWithoutModel {
  async getQueryEmbedding(_query: string) {
    return [0.1, 0.2];
  }
}

describe('LlamaIndexInstrumentation', () => {
  let instrumentation: LlamaIndexInstrumentation;
  let mockModule: Record<string, unknown>;

  beforeEach(() => {
    resetMemoryExporter();
    delete process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
    instrumentation = new LlamaIndexInstrumentation();
    registerInstrumentationTesting(instrumentation);

    mockModule = {
      RetrieverQueryEngine: MockRetrieverQueryEngine,
      MockRetriever: MockRetriever,
      MockEmbedding: MockEmbedding,
      MockEmbeddingWithoutModel: MockEmbeddingWithoutModel,
    };
  });

  afterEach(() => {
    instrumentation.disable();
    delete process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT;
    resetMemoryExporter();
  });

  describe('prototype detection', () => {
    it('correctly identifies retriever prototypes', () => {
      expect(isRetrieverPrototype(MockRetriever.prototype)).toBe(true);
      expect(isRetrieverPrototype(MockEmbedding.prototype)).toBe(false);
      expect(isRetrieverPrototype({})).toBe(false);
      expect(isRetrieverPrototype(null)).toBe(false);
      expect(isRetrieverPrototype(undefined)).toBe(false);

      class SubRetriever extends MockRetriever {}
      expect(isRetrieverPrototype(SubRetriever.prototype)).toBe(false);
    });

    it('correctly identifies embedding prototypes', () => {
      expect(isEmbeddingPrototype(MockEmbedding.prototype)).toBe(true);
      expect(isEmbeddingPrototype(MockRetriever.prototype)).toBe(false);
      expect(isEmbeddingPrototype({})).toBe(false);
      expect(isEmbeddingPrototype(null)).toBe(false);
      expect(isEmbeddingPrototype(undefined)).toBe(false);

      class SubEmbedding extends MockEmbedding {}
      expect(isEmbeddingPrototype(SubEmbedding.prototype)).toBe(false);
    });
  });

  describe('instrumentation lifecycle and multi-instance tracking', () => {
    it('patches and unpatches module properly using WeakSet tracking', () => {
      expect(isPatched(mockModule)).toBe(false);
      expect(instrumentation.isPatched(mockModule)).toBe(false);

      instrumentation.manuallyInstrument(mockModule);
      expect(isPatched(mockModule)).toBe(true);
      expect(instrumentation.isPatched(mockModule)).toBe(true);

      instrumentation.manuallyUninstrument(mockModule);
      expect(isPatched(mockModule)).toBe(false);
      expect(instrumentation.isPatched(mockModule)).toBe(false);

      instrumentation.manuallyInstrument(mockModule);
      expect(instrumentation.isPatched(mockModule)).toBe(true);

      instrumentation.disable();
      expect(instrumentation.isPatched(mockModule)).toBe(false);
    });

    it('handles multiple instances independently without global state conflict', () => {
      const inst1 = new LlamaIndexInstrumentation();
      const inst2 = new LlamaIndexInstrumentation();

      inst1.manuallyInstrument(mockModule);
      expect(inst1.isPatched(mockModule)).toBe(true);
      expect(inst2.isPatched(mockModule)).toBe(false);

      inst1.disable();
      inst2.disable();
    });

    it('unpatches all loaded module copies on disable()', async () => {
      class MockQE1 {
        async query() {
          return { response: '1' };
        }
      }
      class MockQE2 {
        async query() {
          return { response: '2' };
        }
      }

      const copy1 = { RetrieverQueryEngine: MockQE1 };
      const copy2 = { RetrieverQueryEngine: MockQE2 };

      instrumentation.manuallyInstrument(copy1);
      instrumentation.manuallyInstrument(copy2);

      expect(instrumentation.isPatched(copy1)).toBe(true);
      expect(instrumentation.isPatched(copy2)).toBe(true);

      instrumentation.disable();

      expect(instrumentation.isPatched(copy1)).toBe(false);
      expect(instrumentation.isPatched(copy2)).toBe(false);

      const qe1 = new MockQE1();
      const qe2 = new MockQE2();
      await qe1.query();
      await qe2.query();

      expect(getTestSpans().length).toBe(0);
    });
  });

  describe('content capture resolution', () => {
    it('defaults to false (opt-in)', () => {
      expect(isContentCaptureEnabled()).toBe(false);
      expect(isContentCaptureEnabled({})).toBe(false);
      expect(isContentCaptureEnabled({ captureContent: false })).toBe(false);
    });

    it('enables when captureContent is true', () => {
      expect(isContentCaptureEnabled({ captureContent: true })).toBe(true);
    });

    it('respects OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT env var', () => {
      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'true';
      expect(isContentCaptureEnabled({ captureContent: false })).toBe(true);

      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT =
        'span_only';
      expect(isContentCaptureEnabled()).toBe(true);

      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'false';
      expect(isContentCaptureEnabled({ captureContent: true })).toBe(false);
    });
  });

  describe('query engine instrumentation', () => {
    it('creates a span for query engine with content omitted by default and status UNSET', async () => {
      instrumentation.manuallyInstrument(mockModule);

      const engine = new MockRetrieverQueryEngine();
      const result = await engine.query({ query: 'What is OpenTelemetry?' });

      expect(result.response).toEqual('Response to: What is OpenTelemetry?');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe('invoke_workflow RetrieverQueryEngine');
      expect(span.kind).toBe(SpanKind.INTERNAL);
      // Success spans must leave status code UNSET per OTel spec
      expect(span.status.code).toBe(SpanStatusCode.UNSET);

      expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW
      );
      expect(span.attributes[ATTR_GEN_AI_WORKFLOW_NAME]).toBe(
        'RetrieverQueryEngine'
      );
      expect(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES]).toBeUndefined();
      expect(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
    });

    it('captures content serialized as GenAI role/parts JSON when enabled', async () => {
      const contentEnabledInstrumentation = new LlamaIndexInstrumentation({
        captureContent: true,
      });
      registerInstrumentationTesting(contentEnabledInstrumentation);
      contentEnabledInstrumentation.manuallyInstrument(mockModule);

      const engine = new MockRetrieverQueryEngine();
      const result = await engine.query({ query: 'What is OpenTelemetry?' });

      expect(result.response).toEqual('Response to: What is OpenTelemetry?');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES]).toBe(
        formatInputMessages('What is OpenTelemetry?')
      );
      expect(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toBe(
        formatOutputMessages('Response to: What is OpenTelemetry?')
      );

      const parsedInput = JSON.parse(
        span.attributes[ATTR_GEN_AI_INPUT_MESSAGES] as string
      );
      expect(parsedInput).toEqual([
        {
          role: 'user',
          parts: [{ type: 'text', content: 'What is OpenTelemetry?' }],
        },
      ]);

      const parsedOutput = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string
      );
      expect(parsedOutput).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: 'Response to: What is OpenTelemetry?',
            },
          ],
        },
      ]);

      contentEnabledInstrumentation.disable();
    });

    it('creates a span for query engine with string argument', async () => {
      const contentEnabledInstrumentation = new LlamaIndexInstrumentation({
        captureContent: true,
      });
      registerInstrumentationTesting(contentEnabledInstrumentation);
      contentEnabledInstrumentation.manuallyInstrument(mockModule);

      const engine = new MockRetrieverQueryEngine();
      const result = await engine.query('Plain query string');

      expect(result.response).toEqual('Response to: Plain query string');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES]).toBe(
        formatInputMessages('Plain query string')
      );

      contentEnabledInstrumentation.disable();
    });

    it('supports streaming queries and consumes async iterator before ending span', async () => {
      const streamingModule = {
        RetrieverQueryEngine: MockStreamingQueryEngine,
      };

      const contentEnabledInstrumentation = new LlamaIndexInstrumentation({
        captureContent: true,
      });
      registerInstrumentationTesting(contentEnabledInstrumentation);
      contentEnabledInstrumentation.manuallyInstrument(streamingModule);

      const engine = new MockStreamingQueryEngine();
      const stream = (await engine.query({
        query: 'Stream test',
        stream: true,
      })) as AsyncIterable<{ delta: string }>;

      // Before iteration finishes, no span has completed yet
      expect(getTestSpans().length).toBe(0);

      const collected: string[] = [];
      for await (const chunk of stream) {
        collected.push(chunk.delta);
      }

      expect(collected.join('')).toBe(
        'Chunk 1 for Stream test. Chunk 2 for Stream test.'
      );

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      const span = spans[0];
      expect(span.name).toBe('invoke_workflow RetrieverQueryEngine');
      expect(span.status.code).toBe(SpanStatusCode.UNSET);

      const parsedOutput = JSON.parse(
        span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string
      );
      expect(parsedOutput).toEqual([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              content: 'Chunk 1 for Stream test. Chunk 2 for Stream test.',
            },
          ],
        },
      ]);

      contentEnabledInstrumentation.disable();
    });

    it('ends span cleanly when stream.return() is called before first next()', async () => {
      const streamingModule = {
        RetrieverQueryEngine: MockStreamingQueryEngine,
      };

      instrumentation.manuallyInstrument(streamingModule);

      const engine = new MockStreamingQueryEngine();
      const stream = (await engine.query({
        query: 'Cancelled stream',
        stream: true,
      })) as AsyncIterable<unknown>;

      const iter = stream[Symbol.asyncIterator]();
      await iter.return?.();

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].name).toBe('invoke_workflow RetrieverQueryEngine');
      expect(spans[0].status.code).toBe(SpanStatusCode.UNSET);
    });

    it('propagates workflow context to operations performed during stream consumption', async () => {
      class LazyStreamingQueryEngine {
        retriever: MockRetriever;
        constructor(retriever: MockRetriever) {
          this.retriever = retriever;
        }
        async query(_params: unknown) {
          const retriever = this.retriever;
          async function* generate() {
            // Lazy retrieval during stream consumption
            await retriever.retrieve('Lazy retrieve query');
            yield { delta: 'Stream output' };
          }
          return generate();
        }
      }

      const retriever = new MockRetriever();
      const streamingModule = {
        RetrieverQueryEngine: LazyStreamingQueryEngine,
        MockRetriever,
      };

      instrumentation.manuallyInstrument(streamingModule);

      const engine = new LazyStreamingQueryEngine(retriever);
      const stream = (await engine.query({
        query: 'Lazy test',
        stream: true,
      })) as AsyncIterable<unknown>;

      for await (const chunk of stream) {
        expect(chunk).toBeDefined();
      }

      const spans = getTestSpans();
      expect(spans.length).toBe(2);

      const workflowSpan = spans.find(
        s => s.name === 'invoke_workflow RetrieverQueryEngine'
      );
      const retrievalSpan = spans.find(
        s => s.name === GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL
      );

      expect(workflowSpan).toBeDefined();
      expect(retrievalSpan).toBeDefined();
      expect(retrievalSpan?.parentSpanContext?.spanId).toBe(
        workflowSpan?.spanContext().spanId
      );
    });

    it('records error when iterator.next() throws synchronously', async () => {
      class SyncThrowQueryEngine {
        async query(_params: unknown) {
          return {
            [Symbol.asyncIterator]() {
              return {
                next() {
                  throw new Error('Sync next failure');
                },
              };
            },
          };
        }
      }

      const syncThrowModule = {
        RetrieverQueryEngine: SyncThrowQueryEngine,
      };

      instrumentation.manuallyInstrument(syncThrowModule);

      const engine = new SyncThrowQueryEngine();
      const stream = (await engine.query({
        query: 'Sync fail test',
        stream: true,
      })) as AsyncIterable<unknown>;

      const iter = stream[Symbol.asyncIterator]();
      await expect(iter.next()).rejects.toThrow('Sync next failure');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
      expect(spans[0].status.message).toBe('Sync next failure');
    });

    it('records error when stream.return() rejects in finally', async () => {
      class RejectReturnQueryEngine {
        async query(_params: unknown) {
          return {
            [Symbol.asyncIterator]() {
              return {
                async next() {
                  return { done: false, value: { delta: 'Part 1' } };
                },
                async return() {
                  throw new Error('Return finally failure');
                },
              };
            },
          };
        }
      }

      const rejectModule = {
        RetrieverQueryEngine: RejectReturnQueryEngine,
      };

      instrumentation.manuallyInstrument(rejectModule);

      const engine = new RejectReturnQueryEngine();
      const stream = (await engine.query({
        query: 'Reject return test',
        stream: true,
      })) as AsyncIterable<unknown>;

      const iter = stream[Symbol.asyncIterator]();
      await iter.next();
      await expect(iter.return?.()).rejects.toThrow('Return finally failure');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
      expect(spans[0].status.message).toBe('Return finally failure');
    });

    it('keeps span open when generator catches throw() and yields done: false', async () => {
      class CatchThrowQueryEngine {
        async query(_params: unknown) {
          async function* generate() {
            try {
              yield { delta: 'Before throw' };
            } catch {
              yield { delta: 'Recovered after throw' };
            }
          }
          return generate();
        }
      }

      const catchModule = {
        RetrieverQueryEngine: CatchThrowQueryEngine,
      };

      const contentEnabledInstrumentation = new LlamaIndexInstrumentation({
        captureContent: true,
      });
      registerInstrumentationTesting(contentEnabledInstrumentation);
      contentEnabledInstrumentation.manuallyInstrument(catchModule);

      const engine = new CatchThrowQueryEngine();
      const stream = (await engine.query({
        query: 'Catch throw test',
        stream: true,
      })) as AsyncIterable<unknown>;

      const iter = stream[Symbol.asyncIterator]();
      const first = await iter.next();
      expect(first.done).toBe(false);

      // Throws into generator, which catches and yields 'Recovered after throw'
      const second = await iter.throw?.(new Error('Interrupted'));
      expect(second?.done).toBe(false);

      // Span should still be open (not yet ended)
      expect(getTestSpans().length).toBe(0);

      // Finish iteration
      const third = await iter.next();
      expect(third.done).toBe(true);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].status.code).toBe(SpanStatusCode.UNSET);

      const parsedOutput = JSON.parse(
        spans[0].attributes[ATTR_GEN_AI_OUTPUT_MESSAGES] as string
      );
      expect(parsedOutput[0].parts[0].content).toBe(
        'Before throwRecovered after throw'
      );

      contentEnabledInstrumentation.disable();
    });
  });

  describe('context propagation & hierarchy', () => {
    it('propagates workflow span as parent to retriever child span', async () => {
      instrumentation.manuallyInstrument(mockModule);

      const retriever = new MockRetriever();
      const engine = new MockRetrieverQueryEngine(retriever);
      await engine.query({ query: 'Parent child context test' });

      const spans = getTestSpans();
      expect(spans.length).toBe(2);

      const workflowSpan = spans.find(
        s => s.name === 'invoke_workflow RetrieverQueryEngine'
      );
      const retrievalSpan = spans.find(
        s => s.name === GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL
      );

      expect(workflowSpan).toBeDefined();
      expect(retrievalSpan).toBeDefined();

      // Child retrieval span MUST have parentSpanId pointing to workflowSpan
      expect(retrievalSpan?.parentSpanContext?.spanId).toBe(
        workflowSpan?.spanContext().spanId
      );
    });

    it('does not double-wrap retrieve on RetrieverQueryEngine prototype', async () => {
      instrumentation.manuallyInstrument(mockModule);

      const engine = new MockRetrieverQueryEngine();
      // Directly call retrieve on query engine - should NOT emit retrieval span
      const docs = await engine.retrieve('test');
      expect(docs.length).toBe(1);

      const spans = getTestSpans();
      // Since RetrieverQueryEngine.prototype.retrieve is excluded, no span should be emitted
      expect(spans.length).toBe(0);
    });
  });

  describe('retriever instrumentation', () => {
    it('creates a span for retrieve method with topK and doc content when captureContent: true', async () => {
      const contentEnabledInstrumentation = new LlamaIndexInstrumentation({
        captureContent: true,
      });
      registerInstrumentationTesting(contentEnabledInstrumentation);
      contentEnabledInstrumentation.manuallyInstrument(mockModule);

      const retriever = new MockRetriever(3);
      const results = await retriever.retrieve({
        query: 'How to monitor LLMs?',
      });

      expect(results.length).toBe(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe(GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL);
      expect(span.kind).toBe(SpanKind.CLIENT);
      expect(span.status.code).toBe(SpanStatusCode.UNSET);

      expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL
      );
      expect(span.attributes[ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT]).toBe(
        'How to monitor LLMs?'
      );
      expect(span.attributes[ATTR_GEN_AI_RETRIEVAL_TOP_K]).toBe(3);

      const docsAttr = span.attributes[
        ATTR_GEN_AI_RETRIEVAL_DOCUMENTS
      ] as string;
      expect(docsAttr).toBeDefined();
      const parsedDocs = JSON.parse(docsAttr);
      expect(parsedDocs.length).toBe(2);
      expect(parsedDocs[0].id).toBe('doc-1');
      expect(parsedDocs[0].content).toBe('Sample text 1');
      expect(parsedDocs[0].score).toBe(0.95);
      expect(parsedDocs[0].metadata).toEqual({ file: 'test1.txt' });

      contentEnabledInstrumentation.disable();
    });

    it('reads topK from retriever object modality map ({ text: 5 })', async () => {
      instrumentation.manuallyInstrument(mockModule);

      const retriever = new MockRetriever({ text: 5 });
      await retriever.retrieve('Test modality map');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].attributes[ATTR_GEN_AI_RETRIEVAL_TOP_K]).toBe(5);
    });

    it('omits query.text and documents completely when captureContent is false', async () => {
      instrumentation.manuallyInstrument(mockModule);

      const retriever = new MockRetriever(2);
      await retriever.retrieve('Retrieve by string');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.attributes[ATTR_GEN_AI_RETRIEVAL_TOP_K]).toBe(2);
      // Both query text and documents must be omitted per GenAI semconv when captureContent is false
      expect(span.attributes[ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT]).toBeUndefined();
      expect(span.attributes[ATTR_GEN_AI_RETRIEVAL_DOCUMENTS]).toBeUndefined();
    });
  });

  describe('embedding instrumentation', () => {
    it('creates a span for getQueryEmbedding with model attribute and status UNSET', async () => {
      instrumentation.manuallyInstrument(mockModule);

      const embedder = new MockEmbedding();
      const embedding = await embedder.getQueryEmbedding(
        'Vector embedding query'
      );

      expect(embedding.length).toBe(4);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe('embeddings text-embedding-3-small');
      expect(span.kind).toBe(SpanKind.CLIENT);
      expect(span.status.code).toBe(SpanStatusCode.UNSET);

      expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS
      );
      expect(span.attributes[ATTR_GEN_AI_PROVIDER_NAME]).toBe('llamaindex');
      expect(span.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe(
        'text-embedding-3-small'
      );
      expect(span.attributes[ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT]).toBe(4);
    });

    it('creates a span for getQueryEmbedding when model is undefined', async () => {
      instrumentation.manuallyInstrument(mockModule);

      const embedder = new MockEmbeddingWithoutModel();
      const embedding = await embedder.getQueryEmbedding('Anonymous embed');

      expect(embedding.length).toBe(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe('embeddings');
      expect(span.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBeUndefined();
      expect(
        span.attributes[ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT]
      ).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('records error status and exception attributes when query throws', async () => {
      class FailingQueryEngine {
        async query() {
          throw new Error('LlamaIndex network failure');
        }
      }

      const failingModule = {
        RetrieverQueryEngine: FailingQueryEngine,
      };

      instrumentation.manuallyInstrument(failingModule);

      const engine = new FailingQueryEngine();
      await expect(engine.query()).rejects.toThrow(
        'LlamaIndex network failure'
      );

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.status.message).toBe('LlamaIndex network failure');
      expect(span.attributes[ATTR_ERROR_TYPE]).toBe('Error');
    });

    it('records error status when retriever throws', async () => {
      class FailingRetriever {
        async retrieve() {
          throw new Error('Retriever index unavailable');
        }
      }

      const failingModule = {
        FailingRetriever,
      };

      instrumentation.manuallyInstrument(failingModule);

      const retriever = new FailingRetriever();
      await expect(retriever.retrieve()).rejects.toThrow(
        'Retriever index unavailable'
      );

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.status.message).toBe('Retriever index unavailable');
      expect(span.attributes[ATTR_ERROR_TYPE]).toBe('Error');
    });

    it('records error status when embedding throws', async () => {
      class FailingEmbedding {
        model = 'failing-model';
        async getQueryEmbedding() {
          throw new Error('Embedding quota exceeded');
        }
      }

      const failingModule = {
        FailingEmbedding,
      };

      instrumentation.manuallyInstrument(failingModule);

      const embedder = new FailingEmbedding();
      await expect(embedder.getQueryEmbedding()).rejects.toThrow(
        'Embedding quota exceeded'
      );

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.status.message).toBe('Embedding quota exceeded');
      expect(span.attributes[ATTR_ERROR_TYPE]).toBe('Error');
    });
  });
});
