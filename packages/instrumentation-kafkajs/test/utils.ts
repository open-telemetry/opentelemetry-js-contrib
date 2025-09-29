/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import { Attributes, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { CollectionResult, DataPointType } from '@opentelemetry/sdk-metrics';

import {
  METRIC_MESSAGING_CLIENT_SENT_MESSAGES,
  ATTR_MESSAGING_SYSTEM,
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_OPERATION_NAME,
  MESSAGING_SYSTEM_VALUE_KAFKA,
  ATTR_MESSAGING_DESTINATION_PARTITION_ID,
} from '../src/semconv';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';

export function assertMetricCollection(
  { errors, resourceMetrics }: CollectionResult,
  expected: Record<
    string,
    {
      count?: number;
      value?: number;
      buckets?: Record<number, number>;
      attributes: Attributes;
    }[]
  >
) {
  assert.strictEqual(errors.length, 0);
  const { metrics } = resourceMetrics.scopeMetrics[0];
  assert.strictEqual(
    Object.keys(expected).length,
    metrics.length,
    'A different number of metrics were found than expected'
  );
  Object.entries(expected).forEach(([name, values]) => {
    const match = metrics.find(metric => metric.descriptor.name === name);
    assert.ok(match, `metric ${name} not found`);

    if (match.dataPointType === DataPointType.HISTOGRAM) {
      assert.deepStrictEqual(
        match.dataPoints.map(d => d.value.count),
        values.map(v => v.count),
        `${name} datapoints do not have the same count`
      );
      values.forEach(({ buckets }, i) => {
        if (buckets) {
          const { boundaries, counts } = match.dataPoints[i].value.buckets;
          const actualBuckets = counts.reduce((acc, n, j) => {
            if (n > 0) {
              acc[boundaries[j]] = n;
            }
            return acc;
          }, {} as Record<number, number>);
          assert.deepStrictEqual(actualBuckets, buckets);
        }
      });
    } else {
      assert.deepStrictEqual(
        match.dataPoints.map(d => d.value),
        values.map(v => v.value),
        `${name} datapoint values do not match`
      );
    }
    assert.deepStrictEqual(
      match.dataPoints.map(d => d.attributes),
      values.map(v => v.attributes)
    );
  });
}

export async function assertFailedSendSpans({
  spans,
  errorMessage = 'error thrown from kafka client send',
  metricReader,
  expectedTopicCounts,
}: {
  spans: ReadableSpan[];
  metricReader: { collect(): Promise<CollectionResult> };
  errorMessage: string;
  expectedTopicCounts: Record<string, number>;
}): Promise<void> {
  spans.forEach((span, i) => {
    assert.strictEqual(
      span.status.code,
      SpanStatusCode.ERROR,
      `Expected span #${i} status.code to be ERROR`
    );

    assert.strictEqual(
      span.status.message,
      errorMessage,
      `Expected span #${i} status.message to match Kafka send error`
    );
  });

  const expectedMetric = Object.entries(expectedTopicCounts).map(
    ([topic, value]) => ({
      value,
      attributes: {
        [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
        [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        [ATTR_MESSAGING_OPERATION_NAME]: 'send',
        [ATTR_ERROR_TYPE]: 'Error',
      },
    })
  );

  const result = await metricReader.collect();

  assertMetricCollection(result, {
    [METRIC_MESSAGING_CLIENT_SENT_MESSAGES]: expectedMetric,
  });
}

export async function assertSuccessfulSendSpans({
  spans,
  metricReader,
  expectedMetrics,
  perSpan = {},
}: {
  spans: ReadableSpan[];
  metricReader: { collect(): Promise<CollectionResult> };
  expectedMetrics: {
    topic: string;
    value: number;
    partitionId?: string;
  }[];
  perSpan?: Record<number, Attributes>;
}): Promise<void> {
  spans.forEach((span, i) => {
    assert.strictEqual(
      span.kind,
      SpanKind.PRODUCER,
      `Span #${i} should be PRODUCER`
    );
    assert.strictEqual(
      span.status.code,
      SpanStatusCode.UNSET,
      `Span #${i} status.code should be UNSET`
    );
    assert.ok(
      span.name.startsWith('send '),
      `Span #${i} name should start with "send "`
    );
    assert.strictEqual(
      span.attributes[ATTR_MESSAGING_SYSTEM],
      'kafka',
      `Span #${i} ATTR_MESSAGING_SYSTEM mismatch`
    );

    const extra = perSpan[i];
    if (extra) {
      Object.entries(extra).forEach(([key, value]) => {
        assert.strictEqual(
          span.attributes[key],
          value,
          `Span #${i} attribute ${key} mismatch`
        );
      });
    }
  });

  const expectedMetricArray = expectedMetrics.map(
    ({ topic, value, partitionId }) => ({
      value,
      attributes: {
        [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
        [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        [ATTR_MESSAGING_OPERATION_NAME]: 'send',
        ...(partitionId !== undefined && {
          [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: partitionId,
        }),
      },
    })
  );

  const collected = await metricReader.collect();
  assertMetricCollection(collected, {
    [METRIC_MESSAGING_CLIENT_SENT_MESSAGES]: expectedMetricArray,
  });
}

export function haveSameTraceId(spans: ReadableSpan[]): boolean {
  if (spans.length === 0) return false;
  const referenceId = spans[0].spanContext().traceId;
  return spans.every(span => span.spanContext().traceId === referenceId);
}
