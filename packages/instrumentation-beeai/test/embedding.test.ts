/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import {
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_PROVIDER_NAME_VALUE_OLLAMA,
} from '@opentelemetry/genai-util';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { expect } from 'expect';

import {
  ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT,
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  MockEmbeddingModel,
  setupBeeAITestSuite,
} from './helpers';

describe('BeeAIInstrumentation - EmbeddingModel', () => {
  const { getMetricReader } = setupBeeAITestSuite();

  describe('EmbeddingModel instrumentation (EmbeddingInvocation)', () => {
    it('emits a CLIENT embeddings span with dimension count, usage, and duration metric', async () => {
      const embedder = new MockEmbeddingModel({
        modelId: 'nomic-embed-text',
        providerId: 'ollama',
      });

      const result = await embedder.create({
        values: ['first text', 'second text'],
      });
      expect(result.embeddings).toHaveLength(2);

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];

      expect(span.name).toBe('embeddings nomic-embed-text');
      expect(span.kind).toBe(SpanKind.CLIENT);
      expect(span.status.code).toBe(SpanStatusCode.UNSET);
      expect(span.attributes[ATTR_GEN_AI_OPERATION_NAME]).toBe(
        GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS
      );
      expect(span.attributes[ATTR_GEN_AI_PROVIDER_NAME]).toBe(
        GEN_AI_PROVIDER_NAME_VALUE_OLLAMA
      );
      expect(span.attributes[ATTR_GEN_AI_REQUEST_MODEL]).toBe(
        'nomic-embed-text'
      );
      expect(span.attributes[ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT]).toBe(4);
      expect(span.attributes[ATTR_GEN_AI_USAGE_INPUT_TOKENS]).toBe(15);

      const { resourceMetrics } = await getMetricReader().collect();
      const durationMetric = resourceMetrics.scopeMetrics[0]?.metrics.find(
        m => m.descriptor.name === METRIC_GEN_AI_CLIENT_OPERATION_DURATION
      );
      expect(durationMetric?.dataPoints.length).toBe(1);
    });

    it('records error telemetry when EmbeddingModel.create fails', async () => {
      const embedder = new MockEmbeddingModel({
        modelId: 'nomic-embed-text',
        providerId: 'ollama',
        shouldFail: true,
      });

      await expect(embedder.create({ values: ['fail'] })).rejects.toThrow();

      const spans = getTestSpans();
      expect(spans).toHaveLength(1);
      const span = spans[0];
      expect(span.status.code).toBe(SpanStatusCode.ERROR);
      expect(span.attributes[ATTR_ERROR_TYPE]).toBe('EmbeddingModelError');
    });
  });
});
