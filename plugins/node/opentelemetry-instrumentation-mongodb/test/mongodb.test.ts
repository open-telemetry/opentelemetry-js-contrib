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

import { context, trace, SpanKind, Span } from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/tracing';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import * as assert from 'assert';
import { MongoDBInstrumentation, MongoDBInstrumentationConfig } from '../src';
import { CommandResult } from '../src/types';

const instrumentation = new MongoDBInstrumentation();
instrumentation.enable();
instrumentation.disable();

import * as mongodb from 'mongodb';
import { assertSpans, accessCollection } from './utils';

describe('MongoDBInstrumentation', () => {
  function create(config: MongoDBInstrumentationConfig = {}) {
    instrumentation.setConfig(config);
    instrumentation.enable();
  }
  // For these tests, mongo must be running. Add RUN_MONGODB_TESTS to run
  // these tests.
  const RUN_MONGODB_TESTS = process.env.RUN_MONGODB_TESTS as string;
  let shouldTest = true;
  if (!RUN_MONGODB_TESTS) {
    console.log('Skipping test-mongodb. Run MongoDB to test');
    shouldTest = false;
  }
  // shouldTest = true

  const URL = `mongodb://${process.env.MONGODB_HOST || 'localhost'}:${
    process.env.MONGODB_PORT || '27017'
  }`;
  const DB_NAME = process.env.MONGODB_DB || 'opentelemetry-tests';
  const COLLECTION_NAME = 'test';

  let client: mongodb.MongoClient;
  let collection: mongodb.Collection;
  const provider = new BasicTracerProvider();
  const contextManager = new AsyncHooksContextManager().enable();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);

  before(done => {
    instrumentation.enable();
    instrumentation.setTracerProvider(provider);
    provider.addSpanProcessor(spanProcessor);
    context.setGlobalContextManager(contextManager);
    shouldTest = true;
    accessCollection(URL, DB_NAME, COLLECTION_NAME)
      .then(result => {
        client = result.client;
        collection = result.collection;
        done();
      })
      .catch((err: Error) => {
        console.log(
          'Skipping test-mongodb. Could not connect. Run MongoDB to test'
        );
        shouldTest = false;
        done();
      });
  });
  after(() => {
    contextManager.disable();
    instrumentation.disable();
  });

  beforeEach(function mongoBeforeEach(done) {
    // Skipping all tests in beforeEach() is a workaround. Mocha does not work
    // properly when skipping tests in before() on nested describe() calls.
    // https://github.com/mochajs/mocha/issues/2819
    if (!shouldTest) {
      this.skip();
    }
    memoryExporter.reset();
    // Non traced insertion of basic data to perform tests
    const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
    collection.insertMany(insertData, (err, result) => {
      done();
    });
  });

  afterEach(done => {
    memoryExporter.reset();
    if (shouldTest) {
      return collection.deleteMany({}, done);
    }
    done();
  });

  after(() => {
    if (client) {
      client.close();
    }
  });

  /** Should intercept query */
  describe('Instrumenting query operations', () => {
    beforeEach(() => {
      memoryExporter.reset();
    });
    it('should create a child span for insert', done => {
      const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
      const span = provider.getTracer('default').startSpan('insertRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.insertMany(insertData, (err, result) => {
          span.end();
          assert.ifError(err);
          assertSpans(
            memoryExporter.getFinishedSpans(),
            'mongodb.insert',
            SpanKind.CLIENT
          );
          done();
        });
      });
    });

    it('should create a child span for update', done => {
      const span = provider.getTracer('default').startSpan('updateRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.updateOne({ a: 2 }, { $set: { b: 1 } }, (err, result) => {
          span.end();
          assert.ifError(err);
          assertSpans(
            memoryExporter.getFinishedSpans(),
            'mongodb.update',
            SpanKind.CLIENT
          );
          done();
        });
      });
    });

    it('should create a child span for remove', done => {
      const span = provider.getTracer('default').startSpan('removeRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.deleteOne({ a: 3 }, (err, result) => {
          span.end();
          assert.ifError(err);
          assertSpans(
            memoryExporter.getFinishedSpans(),
            'mongodb.remove',
            SpanKind.CLIENT
          );
          done();
        });
      });
    });
  });

  /** Should intercept cursor */
  describe('Instrumenting cursor operations', () => {
    beforeEach(() => {
      memoryExporter.reset();
    });

    it('should create a child span for find', done => {
      const span = provider.getTracer('default').startSpan('findRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.find({ a: 1 }).toArray((err, result) => {
          span.end();
          assert.ifError(err);
          assertSpans(
            memoryExporter.getFinishedSpans(),
            'mongodb.find',
            SpanKind.CLIENT
          );
          done();
        });
      });
    });
    it('should create a child span for cursor operations', done => {
      const span = provider.getTracer('default').startSpan('findRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        const cursor = collection.find().batchSize(1);
        cursor.next().then(firstElement => {
          assert(firstElement !== null);
          cursor.next().then(secondElement => {
            span.end();
            assert(secondElement !== null);
            // assert that we correctly got the first as a find
            assertSpans(
              memoryExporter
                .getFinishedSpans()
                .filter(
                  span => span.name.includes('mongodb.getMore') === false
                ),
              'mongodb.find',
              SpanKind.CLIENT
            );
            // assert that we correctly got the first as a find
            assertSpans(
              memoryExporter
                .getFinishedSpans()
                .filter(span => span.name.includes('mongodb.find') === false),
              'mongodb.getMore',
              SpanKind.CLIENT
            );
            done();
          });
        });
      });
    });
  });

  /** Should intercept command */
  describe('Instrumenting command operations', () => {
    beforeEach(() => {
      memoryExporter.reset();
    });

    it('should create a child span for create index', done => {
      const span = provider.getTracer('default').startSpan('indexRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.createIndex({ a: 1 }, (err, result) => {
          span.end();
          assert.ifError(err);
          assertSpans(
            memoryExporter.getFinishedSpans(),
            'mongodb.createIndexes',
            SpanKind.CLIENT
          );
          done();
        });
      });
    });
  });

  describe('when specifying a responseHook configuration', () => {
    const dataAttributeName = 'mongodb_data';
    beforeEach(() => {
      memoryExporter.reset();
    });

    describe('with a valid function and enhancedDatabaseReporting set to true', () => {
      beforeEach(() => {
        create({
          enhancedDatabaseReporting: true,
          responseHook: (span: Span, result: CommandResult) => {
            span.setAttribute(dataAttributeName, JSON.stringify(result.result));
          }
        });
      })

      it('should attach response hook data to the resulting span for insert function', done => {
        const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
        const span = provider.getTracer('default').startSpan('insertRootSpan');
        context.with(trace.setSpan(context.active(), span), () => {
          collection.insertMany(insertData, (err, result) => {
            span.end();
            assert.ifError(err);
            const spans = memoryExporter.getFinishedSpans();
            const insertSpan = spans[0];

            assert.strictEqual(insertSpan.attributes[dataAttributeName], JSON.stringify(result.result, Object.keys(result.result).sort()));

            memoryExporter.reset();
            done();
          });
        });
      });

      it('should attach response hook data to the resulting span for find function', done => {
        const span = provider.getTracer('default').startSpan('findRootSpan');
        context.with(trace.setSpan(context.active(), span), () => {
          collection.find({ a: 1 }).toArray((err, results) => {
            span.end();
            assert.ifError(err);
            const spans = memoryExporter.getFinishedSpans();
            const findSpan = spans[0];
            const spanResult = JSON.parse(findSpan.attributes[dataAttributeName]?.toString() || '{}');

            assert.strictEqual(spanResult.cursor.firstBatch[0]._id, results[0]._id.toString());

            memoryExporter.reset();
            done();
          });
        });
      });
    });

    describe('with an invalid function', () => {
      beforeEach(() => {
        create({
          enhancedDatabaseReporting: true,
          responseHook: (span: Span, result: CommandResult) => {
            throw 'some error';
          },
        });
      });

      it('should not do any harm when throwing an exception', done => {
        const span = provider.getTracer('default').startSpan('findRootSpan');
        context.with(trace.setSpan(context.active(), span), () => {
          collection.find({ a: 1 }).toArray((err, results) => {
            span.end();
            const spans = memoryExporter.getFinishedSpans();

            assert.ifError(err);
            assertSpans(spans, 'mongodb.find', SpanKind.CLIENT);

            memoryExporter.reset();
            done();
          });
        });
      });
    });
  });

  describe('Mixed operations with callback', () => {
    beforeEach(() => {
      memoryExporter.reset();
    });

    it('should create a span for find after callback insert', done => {
      const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
      const span = provider.getTracer('default').startSpan('insertRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.insertMany(insertData, (err, result) => {
          span.end();
          assert.ifError(err);
          const spans = memoryExporter.getFinishedSpans();
          const mainSpan = spans[spans.length - 1];
          assertSpans(spans, 'mongodb.insert', SpanKind.CLIENT);
          memoryExporter.reset();

          collection.find({ a: 1 }).toArray((err, result) => {
            const spans2 = memoryExporter.getFinishedSpans();
            spans2.push(mainSpan);

            assert.ifError(err);
            assertSpans(spans2, 'mongodb.find', SpanKind.CLIENT);
            assert.strictEqual(
              mainSpan.spanContext().spanId,
              spans2[0].parentSpanId
            );
            memoryExporter.reset();
            done();
          });
        });
      });
    });
  });

  /** Should intercept command */
  describe('Removing Instrumentation', () => {
    beforeEach(() => {
      memoryExporter.reset();
    });

    it('should unpatch plugin', () => {
      assert.doesNotThrow(() => {
        instrumentation.disable();
      });
    });

    it('should not create a child span for query', done => {
      const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
      const span = provider.getTracer('default').startSpan('insertRootSpan');
      collection.insertMany(insertData, (err, result) => {
        span.end();
        assert.ifError(err);
        assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
        done();
      });
    });

    it('should not create a child span for cursor', done => {
      const span = provider.getTracer('default').startSpan('findRootSpan');
      collection.find({}).toArray((err, result) => {
        span.end();
        assert.ifError(err);
        assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
        done();
      });
    });

    it('should not create a child span for command', done => {
      const span = provider.getTracer('default').startSpan('indexRootSpan');
      collection.createIndex({ a: 1 }, (err, result) => {
        span.end();
        assert.ifError(err);
        assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
        done();
      });
    });
  });
});
