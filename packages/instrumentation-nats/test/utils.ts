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
import { Attributes, SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { CollectionResult, DataPointType } from '@opentelemetry/sdk-metrics';

import {
  ATTR_MESSAGING_SYSTEM,
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_OPERATION_NAME,
  MESSAGING_SYSTEM_VALUE_NATS,
  METRIC_MESSAGING_CLIENT_SENT_MESSAGES,
  METRIC_MESSAGING_CLIENT_RECEIVED_MESSAGES,
} from '../src/semconv';

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
  assert.strictEqual(
    errors.length,
    0,
    'Metric collection should have no errors'
  );

  if (resourceMetrics.scopeMetrics.length === 0) {
    assert.fail('No scope metrics found');
  }

  const { metrics } = resourceMetrics.scopeMetrics[0];
  assert.strictEqual(
    Object.keys(expected).length,
    metrics.length,
    `Expected ${Object.keys(expected).length} metrics, found ${metrics.length}`
  );

  Object.entries(expected).forEach(([name, values]) => {
    const match = metrics.find(metric => metric.descriptor.name === name);
    assert.ok(match, `Metric ${name} not found`);

    if (match.dataPointType === DataPointType.HISTOGRAM) {
      assert.deepStrictEqual(
        match.dataPoints.map(d => d.value.count),
        values.map(v => v.count),
        `${name} datapoints do not have the same count`
      );
      values.forEach(({ buckets }, i) => {
        if (buckets) {
          const { boundaries, counts } = match.dataPoints[i].value.buckets;
          const actualBuckets = counts.reduce(
            (acc, n, j) => {
              if (n > 0) {
                acc[boundaries[j]] = n;
              }
              return acc;
            },
            {} as Record<number, number>
          );
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
      values.map(v => v.attributes),
      `${name} datapoint attributes do not match`
    );
  });
}

export function assertPublishSpan(
  span: ReadableSpan,
  expectedSubject: string,
  extraAttributes: Attributes = {}
): void {
  assert.strictEqual(
    span.kind,
    SpanKind.PRODUCER,
    'Publish span should be PRODUCER'
  );
  assert.strictEqual(
    span.name,
    `send ${expectedSubject}`,
    'Span name should match'
  );
  assert.strictEqual(
    span.attributes[ATTR_MESSAGING_SYSTEM],
    MESSAGING_SYSTEM_VALUE_NATS,
    'messaging.system should be nats'
  );
  assert.strictEqual(
    span.attributes[ATTR_MESSAGING_DESTINATION_NAME],
    expectedSubject,
    'destination name should match subject'
  );

  Object.entries(extraAttributes).forEach(([key, value]) => {
    assert.strictEqual(
      span.attributes[key],
      value,
      `Attribute ${key} mismatch`
    );
  });
}

export function assertProcessSpan(
  span: ReadableSpan,
  expectedSubject: string,
  extraAttributes: Attributes = {}
): void {
  assert.strictEqual(
    span.kind,
    SpanKind.CONSUMER,
    'Process span should be CONSUMER'
  );
  assert.strictEqual(
    span.name,
    `process ${expectedSubject}`,
    'Span name should match'
  );
  assert.strictEqual(
    span.attributes[ATTR_MESSAGING_SYSTEM],
    MESSAGING_SYSTEM_VALUE_NATS,
    'messaging.system should be nats'
  );
  assert.strictEqual(
    span.attributes[ATTR_MESSAGING_DESTINATION_NAME],
    expectedSubject,
    'destination name should match subject'
  );

  Object.entries(extraAttributes).forEach(([key, value]) => {
    assert.strictEqual(
      span.attributes[key],
      value,
      `Attribute ${key} mismatch`
    );
  });
}

export function haveSameTraceId(spans: ReadableSpan[]): boolean {
  if (spans.length === 0) return false;
  const referenceId = spans[0].spanContext().traceId;
  return spans.every(span => span.spanContext().traceId === referenceId);
}

export function assertSentMessagesMetric(
  collectionResult: CollectionResult,
  expectedMetrics: { subject: string; value: number; operationName: string }[]
): void {
  const expected = expectedMetrics.map(({ subject, value, operationName }) => ({
    value,
    attributes: {
      [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
      [ATTR_MESSAGING_DESTINATION_NAME]: subject,
      [ATTR_MESSAGING_OPERATION_NAME]: operationName,
    },
  }));

  assertMetricCollection(collectionResult, {
    [METRIC_MESSAGING_CLIENT_SENT_MESSAGES]: expected,
  });
}

export function assertReceivedMessagesMetric(
  collectionResult: CollectionResult,
  expectedMetrics: { subject: string; value: number }[]
): void {
  const expected = expectedMetrics.map(({ subject, value }) => ({
    value,
    attributes: {
      [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
      [ATTR_MESSAGING_DESTINATION_NAME]: subject,
      [ATTR_MESSAGING_OPERATION_NAME]: 'process',
    },
  }));

  assertMetricCollection(collectionResult, {
    [METRIC_MESSAGING_CLIENT_RECEIVED_MESSAGES]: expected,
  });
}
