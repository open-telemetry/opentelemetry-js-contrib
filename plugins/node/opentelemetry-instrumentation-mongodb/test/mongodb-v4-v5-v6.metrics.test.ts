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

// for testing locally "npm run docker:start"

import { MongoDBInstrumentation } from '../src';

// TODO: use test-utils after the new package has released.
import {
  AggregationTemporality,
  DataPointType,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  ResourceMetrics,
} from '@opentelemetry/sdk-metrics';

const otelTestingMeterProvider = new MeterProvider();
const inMemoryMetricsExporter = new InMemoryMetricExporter(
  AggregationTemporality.CUMULATIVE
);
const metricReader = new PeriodicExportingMetricReader({
  exporter: inMemoryMetricsExporter,
  exportIntervalMillis: 100,
  exportTimeoutMillis: 100,
});

import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
const instrumentation = registerInstrumentationTesting(
  new MongoDBInstrumentation()
);

import { accessCollection, DEFAULT_MONGO_HOST } from './utils';
import type { MongoClient } from 'mongodb';
import * as assert from 'assert';

async function waitForNumberOfExports(
  exporter: InMemoryMetricExporter,
  numberOfExports: number
): Promise<ResourceMetrics[]> {
  if (numberOfExports <= 0) {
    throw new Error('numberOfExports must be greater than or equal to 0');
  }

  let totalExports = 0;
  while (totalExports < numberOfExports) {
    await new Promise(resolve => setTimeout(resolve, 20));
    const exportedMetrics = exporter.getMetrics();
    totalExports = exportedMetrics.length;
  }

  return exporter.getMetrics();
}

describe('MongoDBInstrumentation-Metrics', () => {
  // For these tests, mongo must be running. Add RUN_MONGODB_TESTS to run
  // these tests.
  const RUN_MONGODB_TESTS = process.env.RUN_MONGODB_TESTS as string;
  let shouldTest = true;
  if (!RUN_MONGODB_TESTS) {
    console.log('Skipping test-mongodb. Run MongoDB to test');
    shouldTest = false;
  }

  const HOST = process.env.MONGODB_HOST || DEFAULT_MONGO_HOST;
  const PORT = process.env.MONGODB_PORT || 27017;
  const DB_NAME = process.env.MONGODB_DB || 'opentelemetry-tests-metrics';
  const COLLECTION_NAME = 'test-metrics';
  const URL = `mongodb://${HOST}:${PORT}/${DB_NAME}`;
  
  let client: MongoClient;
  let collection: Collection;

  before(done => {
    otelTestingMeterProvider.addMetricReader(metricReader);
    instrumentation?.setMeterProvider(otelTestingMeterProvider);

    shouldTest = true;
    accessCollection(URL, DB_NAME, COLLECTION_NAME)
      .then(result => {
        client = result.client;
        collection = result.collection;
        done();
      })
      .catch((err: Error) => {
        console.log(
          'Skipping test-mongodb. ' + err.message
        );
        shouldTest = false;
        done();
      });
  });


  beforeEach(function mongoBeforeEach(done) {
    // Skipping all tests in beforeEach() is a workaround. Mocha does not work
    // properly when skipping tests in before() on nested describe() calls.
    // https://github.com/mochajs/mocha/issues/2819
    if (!shouldTest) {
      this.skip();
    }

    inMemoryMetricsExporter.reset();
    done();
  });

  it('Should add connection usage metrics', async () => {
    const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
    await collection.insertMany(insertData);
    await collection.deleteMany({});
    const exportedMetrics = await waitForNumberOfExports(
      inMemoryMetricsExporter,
      1
    );

    assert.strictEqual(exportedMetrics.length, 1);
    const metrics = exportedMetrics[0].scopeMetrics[0].metrics;
    assert.strictEqual(metrics.length, 1);
    assert.strictEqual(metrics[0].dataPointType, DataPointType.SUM);

    assert.strictEqual(
      metrics[0].descriptor.description,
      'The number of connections that are currently in state described by the state attribute.'
    );
    assert.strictEqual(metrics[0].descriptor.unit, '{connection}');
    assert.strictEqual(
      metrics[0].descriptor.name,
      'db.client.connections.usage'
    );

    // Checking dataPoints
    const dataPoints = metrics[0].dataPoints;
    assert.strictEqual(dataPoints.length, 2);
    assert.strictEqual(dataPoints[0].value, 0);
    assert.strictEqual(dataPoints[0].attributes['state'], 'used');
    assert.strictEqual(
      dataPoints[0].attributes['pool.name'],
      `mongodb://${HOST}:${PORT}/${DB_NAME}`
    );

    assert.strictEqual(dataPoints[1].value, 1);
    assert.strictEqual(dataPoints[1].attributes['state'], 'idle');
    assert.strictEqual(
      dataPoints[1].attributes['pool.name'],
      `mongodb://${HOST}:${PORT}/${DB_NAME}`
    );
  });

  it('Should add disconnection usage metrics', async () => {
    await client.close();

    const exportedMetrics = await waitForNumberOfExports(
      inMemoryMetricsExporter,
      2
    );
    assert.strictEqual(exportedMetrics.length, 2);
    const metrics = exportedMetrics[1].scopeMetrics[0].metrics;
    assert.strictEqual(metrics.length, 1);
    assert.strictEqual(metrics[0].dataPointType, DataPointType.SUM);

    assert.strictEqual(
      metrics[0].descriptor.description,
      'The number of connections that are currently in state described by the state attribute.'
    );

    // Checking dataPoints
    const dataPoints = metrics[0].dataPoints;
    assert.strictEqual(dataPoints.length, 2);
    assert.strictEqual(dataPoints[0].value, 0);
    assert.strictEqual(dataPoints[0].attributes['state'], 'used');
    assert.strictEqual(
      dataPoints[0].attributes['pool.name'],
      `mongodb://${HOST}:${PORT}/${DB_NAME}`
    );
    assert.strictEqual(dataPoints[1].value, 0);
    assert.strictEqual(dataPoints[1].attributes['state'], 'idle');
    assert.strictEqual(
      dataPoints[1].attributes['pool.name'],
      `mongodb://${HOST}:${PORT}/${DB_NAME}`
    );
  });
});
