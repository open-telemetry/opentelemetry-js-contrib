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

otelTestingMeterProvider.addMetricReader(metricReader);

const instrumentation = new MongoDBInstrumentation();
instrumentation.enable();

instrumentation.setMeterProvider(otelTestingMeterProvider);

import { accessCollection, DEFAULT_MONGO_HOST } from './utils';

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

describe('MongoDBInstrumentation', () => {
  // For these tests, mongo must be running. Add RUN_MONGODB_TESTS to run
  // these tests.
  const RUN_MONGODB_TESTS = process.env.RUN_MONGODB_TESTS as string;
  let shouldTest = true;
  if (shouldTest) {
    console.log('running');
  }
  if (!RUN_MONGODB_TESTS) {
    console.log('Skipping test-mongodb. Run MongoDB to test');
    shouldTest = false;
  }

  const URL = `mongodb://${process.env.MONGODB_HOST || DEFAULT_MONGO_HOST}:${
    process.env.MONGODB_PORT || '27017'
  }`;
  const DB_NAME = process.env.MONGODB_DB || 'opentelemetry-tests';
  const COLLECTION_NAME = 'test';

  describe('Metrics', () => {
    beforeEach(() => {
      inMemoryMetricsExporter.reset();
    });

    it('Should add connection usage metrics', async () => {
      const result = await accessCollection(URL, DB_NAME, COLLECTION_NAME);
      const metricsClient = result.client;
      const metricsCollection = result.collection;
      waitForNumberOfExports(inMemoryMetricsExporter, 1).then(
        (exportedMetrics: ResourceMetrics[]) => {
          console.log(exportedMetrics);
        }
      );

      const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
      await metricsCollection.insertMany(insertData);
      await metricsClient.close();
    });
  });
});
