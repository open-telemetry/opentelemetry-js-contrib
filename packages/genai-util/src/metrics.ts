/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes, Histogram, Meter } from '@opentelemetry/api';
import {
  ATTR_GEN_AI_TOKEN_TYPE,
  GEN_AI_TOKEN_TYPE_VALUE_INPUT,
  GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK,
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
  METRIC_GEN_AI_SERVER_TIME_TO_FIRST_TOKEN,
} from './semconv';
import type { TokenUsage } from './types';

/**
 * Standard explicit bucket boundaries for GenAI operation duration (in seconds).
 *
 * @experimental
 */
export const GENAI_OPERATION_DURATION_BUCKETS = [
  0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48,
  40.96, 81.92,
];

/**
 * Standard explicit bucket boundaries for GenAI token usage.
 *
 * @experimental
 */
export const GENAI_TOKEN_USAGE_BUCKETS = [
  1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304,
  16777216, 67108864,
];

/**
 * Standard explicit bucket boundaries for GenAI client time to first chunk (in seconds).
 *
 * @experimental
 */
export const GENAI_TIME_TO_FIRST_CHUNK_BUCKETS = [
  0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30,
];

/**
 * Standard explicit bucket boundaries for GenAI time to first token (in seconds).
 *
 * Adopted from vLLM: https://github.com/vllm-project/vllm/blob/main/vllm/v1/metrics/loggers.py
 *
 * @experimental
 */
export const GENAI_SERVER_TIME_TO_FIRST_TOKEN_BUCKETS = [
  0.001, 0.005, 0.01, 0.02, 0.04, 0.06, 0.08, 0.1, 0.25, 0.5, 0.75, 1.0, 1.25,
  1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0,
  8.5, 9.0, 9.5, 10.0,
];

/**
 * Options for creating GenAI metric instruments.
 *
 * @experimental
 */
export interface MetricCreationOptions {
  /** Metric instrument name override. */
  name?: string;
  /** Metric description override. */
  description?: string;
  /** Metric unit override. */
  unit?: string;
}

/**
 * Create standard `gen_ai.client.operation.duration` histogram.
 *
 * @experimental
 */
export function createDurationHistogram(
  meter: Meter,
  options?: MetricCreationOptions
): Histogram {
  return meter.createHistogram(
    options?.name ?? METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
    {
      description: options?.description ?? 'GenAI operation duration',
      unit: options?.unit ?? 's',
      advice: {
        explicitBucketBoundaries: GENAI_OPERATION_DURATION_BUCKETS,
      },
    }
  );
}

/**
 * Create standard `gen_ai.client.token.usage` histogram.
 *
 * @experimental
 */
export function createTokenUsageHistogram(
  meter: Meter,
  options?: MetricCreationOptions
): Histogram {
  return meter.createHistogram(
    options?.name ?? METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
    {
      description:
        options?.description ??
        'Measures number of input and output tokens used',
      unit: options?.unit ?? '{token}',
      advice: {
        explicitBucketBoundaries: GENAI_TOKEN_USAGE_BUCKETS,
      },
    }
  );
}

/**
 * Create standard `gen_ai.client.operation.time_to_first_chunk` histogram.
 *
 * @experimental
 */
export function createTimeToFirstChunkHistogram(
  meter: Meter,
  options?: MetricCreationOptions
): Histogram {
  return meter.createHistogram(
    options?.name ?? METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK,
    {
      description:
        options?.description ??
        'Time to first chunk for streaming response in seconds',
      unit: options?.unit ?? 's',
      advice: {
        explicitBucketBoundaries: GENAI_TIME_TO_FIRST_CHUNK_BUCKETS,
      },
    }
  );
}

/**
 * Create standard `gen_ai.server.time_to_first_token` histogram.
 *
 * @experimental
 */
export function createServerTimeToFirstTokenHistogram(
  meter: Meter,
  options?: MetricCreationOptions
): Histogram {
  return meter.createHistogram(
    options?.name ?? METRIC_GEN_AI_SERVER_TIME_TO_FIRST_TOKEN,
    {
      description:
        options?.description ??
        'Time to first token for streaming response in seconds',
      unit: options?.unit ?? 's',
      advice: {
        explicitBucketBoundaries: GENAI_SERVER_TIME_TO_FIRST_TOKEN_BUCKETS,
      },
    }
  );
}

/**
 * Internal helper to validate and record a duration value in seconds.
 */
function _recordDuration(
  histogram: Histogram | undefined,
  durationSeconds: number,
  attributes?: Attributes
): void {
  if (!histogram || durationSeconds < 0 || !isFinite(durationSeconds)) {
    return;
  }
  histogram.record(durationSeconds, attributes);
}

/**
 * Record operation duration metric.
 *
 * @experimental
 */
export function recordOperationDuration(
  histogram: Histogram | undefined,
  durationSeconds: number,
  attributes?: Attributes
): void {
  _recordDuration(histogram, durationSeconds, attributes);
}

/**
 * Record token usage metrics (both input and output tokens if present).
 *
 * @experimental
 */
export function recordTokenUsage(
  histogram: Histogram | undefined,
  usage: TokenUsage | undefined,
  attributes?: Attributes
): void {
  if (!histogram || !usage) {
    return;
  }

  if (typeof usage.inputTokens === 'number' && usage.inputTokens >= 0) {
    histogram.record(usage.inputTokens, {
      ...attributes,
      [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT,
    });
  }

  if (typeof usage.outputTokens === 'number' && usage.outputTokens >= 0) {
    histogram.record(usage.outputTokens, {
      ...attributes,
      [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT,
    });
  }
}

/**
 * Record time to first chunk metric.
 *
 * @experimental
 */
export function recordTimeToFirstChunk(
  histogram: Histogram | undefined,
  durationSeconds: number,
  attributes?: Attributes
): void {
  _recordDuration(histogram, durationSeconds, attributes);
}

/**
 * Record server time to first token metric.
 *
 * @experimental
 */
export function recordServerTimeToFirstToken(
  histogram: Histogram | undefined,
  durationSeconds: number,
  attributes?: Attributes
): void {
  _recordDuration(histogram, durationSeconds, attributes);
}
