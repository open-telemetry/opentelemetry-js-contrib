/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanStatusCode } from '@opentelemetry/api';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { DataPoint, Histogram } from '@opentelemetry/sdk-metrics';
import {
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_SYSTEM_NAME,
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  DB_SYSTEM_NAME_VALUE_POSTGRESQL,
  METRIC_DB_CLIENT_OPERATION_DURATION,
} from '@opentelemetry/semantic-conventions';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { PgInstrumentation } from '../src';
import { PgClientExtended } from '../src/internal-types';

// Exercise Promise completion without requiring a PostgreSQL server.
describe('pg query Promise metrics', () => {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter })],
  });
  const client = {
    database: 'test',
    connectionParameters: {
      database: 'test',
      host: 'localhost',
      port: 5432,
      user: 'postgres',
    },
  } as PgClientExtended;
  let instrumentation: PgInstrumentation;
  let metricReader: testUtils.TestMetricReader;

  beforeEach(() => {
    instrumentation = new PgInstrumentation({ enabled: false });
    instrumentation.setTracerProvider(provider);
    metricReader = testUtils.initMeterProvider(instrumentation);
    exporter.reset();
  });

  for (const [description, error, errorType] of [
    [
      'SQLSTATE Error',
      Object.assign(new Error('query failed'), { code: '42P01' }),
      '42P01',
    ],
    ['Error without a code', new Error('query failed'), undefined],
    ['non-Error object', { message: 'query failed', code: '42P01' }, '42P01'],
  ] as const) {
    it(`should preserve ${description} and record its duration once`, async () => {
      const original = sinon.stub().callsFake(() => Promise.reject(error));
      const query = instrumentation['_getClientQueryPatch']()(original);
      const promise = query.call(client, 'SELECT 1');
      assert.ok(promise instanceof Promise);
      await assert.rejects(promise, rejection => {
        assert.strictEqual(rejection, error);
        return true;
      });
      assert.strictEqual(original.callCount, 1);
      assert.deepStrictEqual(original.firstCall.args, ['SELECT 1']);
      assert.strictEqual(original.firstCall.thisValue, client);

      const { resourceMetrics, errors } = await metricReader.collect();
      assert.deepStrictEqual(errors, []);
      const metric = resourceMetrics.scopeMetrics
        .flatMap(scope => scope.metrics)
        .find(
          metric =>
            metric.descriptor.name === METRIC_DB_CLIENT_OPERATION_DURATION
        );
      assert.ok(metric, 'expected query duration metric');
      assert.strictEqual(metric.dataPoints.length, 1);
      const point = metric.dataPoints[0] as DataPoint<Histogram>;
      assert.deepStrictEqual(point.attributes, {
        [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_POSTGRESQL,
        [ATTR_DB_NAMESPACE]: 'test',
        [ATTR_SERVER_ADDRESS]: 'localhost',
        [ATTR_SERVER_PORT]: 5432,
        [ATTR_DB_OPERATION_NAME]: 'SELECT',
        ...(errorType ? { [ATTR_ERROR_TYPE]: errorType } : {}),
      });
      assert.strictEqual(point.value.count, 1);
      const spans = exporter.getFinishedSpans();
      assert.strictEqual(spans.length, 1);
      assert.strictEqual(spans[0].status.code, SpanStatusCode.ERROR);
      assert.strictEqual(
        spans[0].events.length,
        error instanceof Error ? 1 : 0
      );
    });
  }

  it('should preserve a successful query result and execute once', async () => {
    const result = { rows: [{ value: 1 }] };
    const original = sinon.stub().resolves(result);
    const query = instrumentation['_getClientQueryPatch']()(original);
    assert.strictEqual(await query.call(client, 'SELECT 1'), result);
    assert.strictEqual(original.callCount, 1);
  });
});
