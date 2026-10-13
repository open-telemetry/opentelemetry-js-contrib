/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ValueType,
  type Counter,
  type Histogram,
  type Meter,
} from '@opentelemetry/api';
import {
  METRIC_GEN_AI_CLIENT_OPERATION_DURATION,
  METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK,
  METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK,
  METRIC_GEN_AI_EXECUTE_TOOL_DURATION,
  METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_READ_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_WRITE_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
  METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_REASONING_OUTPUT_TOKENS,
} from './semconv';

/**
 * Standard explicit bucket boundaries for GenAI operation duration (in seconds).
 *
 * @experimental
 */
const GENAI_OPERATION_DURATION_BUCKETS = [
  0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48,
  40.96, 81.92,
];

/**
 * Standard explicit bucket boundaries for GenAI token usage.
 *
 * @experimental
 */
const GENAI_TOKEN_USAGE_BUCKETS = [
  1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304,
  16777216, 67108864,
];

/**
 * Standard explicit bucket boundaries for GenAI client time to first chunk (in seconds).
 *
 * @experimental
 */
const GENAI_TIME_TO_FIRST_CHUNK_BUCKETS = [
  0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48,
  40.96, 81.92,
];

/**
 * Standard explicit bucket boundaries for GenAI time per output chunk (in seconds).
 *
 * @experimental
 */
const GENAI_TIME_PER_OUTPUT_CHUNK_BUCKETS = [
  0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48,
  40.96, 81.92,
];

/**
 * Create standard `gen_ai.client.operation.duration` histogram.
 *
 * @experimental
 */
export function createDurationHistogram(meter: Meter): Histogram {
  return meter.createHistogram(METRIC_GEN_AI_CLIENT_OPERATION_DURATION, {
    description: 'Duration of GenAI client operation',
    unit: 's',
    advice: {
      explicitBucketBoundaries: GENAI_OPERATION_DURATION_BUCKETS,
    },
  });
}

/**
 * Create standard `gen_ai.client.inference.operation.input_tokens` histogram.
 *
 * @experimental
 */
export function createInputTokenOperationHistogram(meter: Meter): Histogram {
  return meter.createHistogram(
    METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS,
    {
      description: 'Number of input tokens used per inference operation',
      unit: '{token}',
      valueType: ValueType.INT,
      advice: {
        explicitBucketBoundaries: GENAI_TOKEN_USAGE_BUCKETS,
      },
    }
  );
}

/**
 * Create standard `gen_ai.client.inference.operation.output_tokens` histogram.
 *
 * @experimental
 */
export function createOutputTokenOperationHistogram(meter: Meter): Histogram {
  return meter.createHistogram(
    METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS,
    {
      description: 'Number of output tokens used per inference operation',
      unit: '{token}',
      valueType: ValueType.INT,
      advice: {
        explicitBucketBoundaries: GENAI_TOKEN_USAGE_BUCKETS,
      },
    }
  );
}

/**
 * Create standard `gen_ai.client.inference.usage.input_tokens` counter.
 *
 * @experimental
 */
export function createInputTokenUsageCounter(meter: Meter): Counter {
  return meter.createCounter(
    METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS,
    {
      description:
        'The number of input (prompt) tokens used, including cached tokens.',
      unit: '{token}',
      valueType: ValueType.INT,
    }
  );
}

/**
 * Create standard `gen_ai.client.inference.usage.output_tokens` counter.
 *
 * @experimental
 */
export function createOutputTokenUsageCounter(meter: Meter): Counter {
  return meter.createCounter(
    METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS,
    {
      description:
        'The number of output (completion) tokens used, including reasoning tokens.',
      unit: '{token}',
      valueType: ValueType.INT,
    }
  );
}

/**
 * Create standard `gen_ai.client.inference.usage.cache_read.input_tokens` counter.
 *
 * @experimental
 */
export function createCacheReadInputTokenUsageCounter(meter: Meter): Counter {
  return meter.createCounter(
    METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_READ_INPUT_TOKENS,
    {
      description:
        'The number of input tokens served from a provider-managed cache.',
      unit: '{token}',
      valueType: ValueType.INT,
    }
  );
}

/**
 * Create standard `gen_ai.client.inference.usage.cache_write.input_tokens` counter.
 *
 * @experimental
 */
export function createCacheWriteInputTokenUsageCounter(meter: Meter): Counter {
  return meter.createCounter(
    METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_WRITE_INPUT_TOKENS,
    {
      description:
        'The number of input tokens written to a provider-managed cache.',
      unit: '{token}',
      valueType: ValueType.INT,
    }
  );
}

/**
 * Create standard `gen_ai.client.inference.usage.reasoning.output_tokens` counter.
 *
 * @experimental
 */
export function createReasoningOutputTokenUsageCounter(meter: Meter): Counter {
  return meter.createCounter(
    METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_REASONING_OUTPUT_TOKENS,
    {
      description:
        'The number of output tokens used for reasoning (e.g. chain-of-thought, extended thinking).',
      unit: '{token}',
      valueType: ValueType.INT,
    }
  );
}

/**
 * Create standard `gen_ai.client.operation.time_to_first_chunk` histogram.
 *
 * @experimental
 */
export function createTimeToFirstChunkHistogram(meter: Meter): Histogram {
  return meter.createHistogram(
    METRIC_GEN_AI_CLIENT_OPERATION_TIME_TO_FIRST_CHUNK,
    {
      description:
        'Time to receive the first chunk, measured from when the client issues the generation request to when the first chunk is received in the response stream.',
      unit: 's',
      advice: {
        explicitBucketBoundaries: GENAI_TIME_TO_FIRST_CHUNK_BUCKETS,
      },
    }
  );
}

/**
 * Create standard `gen_ai.client.operation.time_per_output_chunk` histogram.
 *
 * @experimental
 */
export function createTimePerOutputChunkHistogram(meter: Meter): Histogram {
  return meter.createHistogram(
    METRIC_GEN_AI_CLIENT_OPERATION_TIME_PER_OUTPUT_CHUNK,
    {
      description:
        'Time per output chunk, recorded for each chunk received after the first one, measured as the time elapsed from the end of the previous chunk to the end of the current chunk.',
      unit: 's',
      advice: {
        explicitBucketBoundaries: GENAI_TIME_PER_OUTPUT_CHUNK_BUCKETS,
      },
    }
  );
}

/**
 * Create standard `gen_ai.execute_tool.duration` histogram.
 *
 * @experimental
 */
export function createExecuteToolDurationHistogram(meter: Meter): Histogram {
  return meter.createHistogram(METRIC_GEN_AI_EXECUTE_TOOL_DURATION, {
    description: 'The duration of a single tool execution.',
    unit: 's',
    advice: {
      explicitBucketBoundaries: GENAI_OPERATION_DURATION_BUCKETS,
    },
  });
}
