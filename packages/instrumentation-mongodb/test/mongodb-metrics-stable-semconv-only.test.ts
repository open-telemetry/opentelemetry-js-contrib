/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Set BEFORE importing the instrumentation
// This test file uses stable-only semconv (no OLD bit)
process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http/dup,database';

import { MongoDBInstrumentation } from '../src';

import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { TestMetricReader } from '@opentelemetry/contrib-test-utils';

const reader2 = new TestMetricReader();
const otelTestingMeterProvider2 = new MeterProvider({
  readers: [reader2],
});

import { registerInstrumentationTesting } from '@opentelemetry/contrib-test-utils';
const instrumentation2 = registerInstrumentationTesting(
  new MongoDBInstrumentation()
);

import { accessCollection, DEFAULT_MONGO_HOST } from './utils';
import type { MongoClient, Collection } from 'mongodb';
import * as assert from 'assert';

describe('MongoDBInstrumentation-Metrics-v4+ (stable semconv only)', () => {
  // db.client.connections.usage is pre-stable. It must not be emitted
  // when only the stable semconv is opted into (no OLD bit).
  const RUN_MONGODB_TESTS = process.env.RUN_MONGODB_TESTS as string;
  let shouldTest = true;
  if (!RUN_MONGODB_TESTS) {
    console.log('Skipping test-mongodb (stable). Run MongoDB to test');
    shouldTest = false;
  }

  const HOST = process.env.MONGODB_HOST || DEFAULT_MONGO_HOST;
  const PORT = process.env.MONGODB_PORT || 27017;
  const DB_NAME = process.env.MONGODB_DB || 'opentelemetry-tests-metrics-stable';
  const COLLECTION_NAME = 'test-metrics-stable';
  const URL = `mongodb://${HOST}:${PORT}/${DB_NAME}`;

  let client: MongoClient;
  let collection: Collection;

  before(done => {
    instrumentation2?.setMeterProvider(otelTestingMeterProvider2);

    shouldTest = true;
    accessCollection(URL, DB_NAME, COLLECTION_NAME)
      .then(result => {
        client = result.client;
        collection = result.collection;
        done();
      })
      .catch((err: Error) => {
        console.log('Skipping test-mongodb (stable). ' + err.message);
        shouldTest = false;
        done();
      });
  });

  beforeEach(function mongoBeforeEach(done) {
    if (!shouldTest) {
      this.skip();
    }
    done();
  });

  it('should not add connection usage metrics', async () => {
    const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
    await collection.insertMany(insertData);
    await collection.deleteMany({});

    const result = await reader2.collect();
    assert.strictEqual(
      result.errors.length,
      0,
      'Expected no errors during metric collection, got: ' +
        result.errors.toString()
    );

    const metrics = result.resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    assert.strictEqual(
      metrics.length,
      0,
      'db.client.connections.usage should not be emitted with stable-only semconv'
    );
  });

  it('should not add disconnection usage metrics', async () => {
    await client.close();

    const result = await reader2.collect();
    assert.strictEqual(
      result.errors.length,
      0,
      'Expected no errors during metric collection, got: ' +
        result.errors.toString()
    );

    const metrics = result.resourceMetrics.scopeMetrics[0]?.metrics ?? [];
    assert.strictEqual(
      metrics.length,
      0,
      'db.client.connections.usage should not be emitted with stable-only semconv'
    );
  });
});
