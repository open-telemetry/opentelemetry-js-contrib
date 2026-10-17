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
  isContentCaptureEnabled,
  isEmbeddingPrototype,
  isRetrieverPrototype,
} from '../src/utils';

class MockRetrieverQueryEngine {
  async query(params: { query: string } | string) {
    const q = typeof params === 'string' ? params : params.query;
    return { response: `Response to: ${q}` };
  }
}

class MockRetriever {
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
    });

    it('correctly identifies embedding prototypes', () => {
      expect(isEmbeddingPrototype(MockEmbedding.prototype)).toBe(true);
      expect(isEmbeddingPrototype(MockRetriever.prototype)).toBe(false);
      expect(isEmbeddingPrototype({})).toBe(false);
      expect(isEmbeddingPrototype(null)).toBe(false);
      expect(isEmbeddingPrototype(undefined)).toBe(false);
    });
  });

  describe('instrumentation lifecycle', () => {
    it('patches and unpatches module properly', () => {
      expect(isPatched()).toBe(false);
      instrumentation.manuallyInstrument(mockModule);
      expect(isPatched()).toBe(true);

      instrumentation.manuallyUninstrument();
      expect(isPatched()).toBe(false);

      instrumentation.manuallyInstrument(mockModule);
      expect(isPatched()).toBe(true);

      instrumentation.disable();
      expect(isPatched()).toBe(false);
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
    it('creates a span for query engine with content omitted by default', async () => {
      instrumentation.manuallyInstrument(mockModule);

      const engine = new MockRetrieverQueryEngine();
      const result = await engine.query({ query: 'What is OpenTelemetry?' });

      expect(result.response).toEqual('Response to: What is OpenTelemetry?');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe('invoke_workflow RetrieverQueryEngine');
      expect(span.kind).toBe(SpanKind.INTERNAL);
      expect(span.status.code).toBe(SpanStatusCode.OK);

      expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW
      );
      expect(span.attributes[ATTR_GEN_AI_WORKFLOW_NAME]).toBe(
        'RetrieverQueryEngine'
      );
      expect(span.attributes[ATTR_GEN_AI_INPUT_MESSAGES]).toBeUndefined();
      expect(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toBeUndefined();
    });

    it('captures content when captureContent is enabled', async () => {
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
        'What is OpenTelemetry?'
      );
      expect(span.attributes[ATTR_GEN_AI_OUTPUT_MESSAGES]).toBe(
        'Response to: What is OpenTelemetry?'
      );

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
        'Plain query string'
      );

      contentEnabledInstrumentation.disable();
    });
  });

  describe('retriever instrumentation', () => {
    it('creates a span for retrieve method with topK', async () => {
      const contentEnabledInstrumentation = new LlamaIndexInstrumentation({
        captureContent: true,
      });
      registerInstrumentationTesting(contentEnabledInstrumentation);
      contentEnabledInstrumentation.manuallyInstrument(mockModule);

      const retriever = new MockRetriever();
      const results = await retriever.retrieve({
        query: 'How to monitor LLMs?',
        topK: 2,
      });

      expect(results.length).toBe(2);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.name).toBe(GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL);
      expect(span.kind).toBe(SpanKind.INTERNAL);
      expect(span.status.code).toBe(SpanStatusCode.OK);

      expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL
      );
      expect(span.attributes[ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT]).toBe(
        'How to monitor LLMs?'
      );
      expect(span.attributes[ATTR_GEN_AI_RETRIEVAL_TOP_K]).toBe(2);

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

    it('omits document content when captureContent is false', async () => {
      instrumentation.manuallyInstrument(mockModule);

      const retriever = new MockRetriever();
      await retriever.retrieve('Retrieve by string');

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      const span = spans[0];
      expect(span.attributes[ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT]).toBe(
        'Retrieve by string'
      );

      const docsAttr = span.attributes[
        ATTR_GEN_AI_RETRIEVAL_DOCUMENTS
      ] as string;
      expect(docsAttr).toBeDefined();
      const parsedDocs = JSON.parse(docsAttr);
      expect(parsedDocs[0].content).toBeUndefined();
      expect(parsedDocs[0].id).toBe('doc-1');
    });
  });

  describe('embedding instrumentation', () => {
    it('creates a span for getQueryEmbedding with model attribute', async () => {
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
      expect(span.status.code).toBe(SpanStatusCode.OK);

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
      expect(span.attributes[ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT]).toBe(2);
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
