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
  METRIC_GEN_AI_CLIENT_TOKEN_USAGE,
  METRIC_GEN_AI_SERVER_TIME_TO_FIRST_TOKEN,
} from './semconv';
import type { TokenUsage } from './types';

/**
 * Standard explicit bucket boundaries for GenAI operation duration (in seconds).
 */
export const GENAI_OPERATION_DURATION_BUCKETS = [
  0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48,
  40.96, 81.92,
];

/**
 * Standard explicit bucket boundaries for GenAI token usage.
 */
export const GENAI_TOKEN_USAGE_BUCKETS = [
  1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304,
  16777216, 67108864,
];

/**
 * Standard explicit bucket boundaries for GenAI time to first token (in seconds).
 */
export const GENAI_SERVER_TIME_TO_FIRST_TOKEN_BUCKETS = [
  0.001, 0.005, 0.01, 0.02, 0.04, 0.06, 0.08, 0.1, 0.25, 0.5, 0.75, 1.0, 1.25,
  1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0,
  8.5, 9.0, 9.5, 10.0,
];

/**
 * Options for creating GenAI metric instruments.
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
 * Create standard `gen_ai.server.time_to_first_token` histogram.
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
 * Record operation duration metric.
 */
export function recordOperationDuration(
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
 * Record token usage metrics (both input and output tokens if present).
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
 * Record server time to first token metric.
 */
export function recordServerTimeToFirstToken(
  histogram: Histogram | undefined,
  durationSeconds: number,
  attributes?: Attributes
): void {
  if (!histogram || durationSeconds < 0 || !isFinite(durationSeconds)) {
    return;
  }
  histogram.record(durationSeconds, attributes);
}
