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

/* For testing locally "npm run docker:start"
 * These tests cannot be run against the default package dependencies.
 * In order to run the tests you can "npm run test-all-versions" or install mongodb v3 manually.
 */

import { context, trace, SpanKind, Span } from '@opentelemetry/api';
import * as assert from 'assert';
import { MongoDBInstrumentation, MongoDBInstrumentationConfig } from '../src';
import { MongoResponseHookInformation } from '../src';
import {
  registerInstrumentationTesting,
  getTestSpans,
  resetMemoryExporter,
} from '@opentelemetry/contrib-test-utils';
import { lookup } from 'dns';

const instrumentation = registerInstrumentationTesting(
  new MongoDBInstrumentation()
);

import * as mongodb from 'mongodb';
import { assertSpans, accessCollection, DEFAULT_MONGO_HOST } from './utils';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

describe('MongoDBInstrumentation', () => {
  function create(config: MongoDBInstrumentationConfig = {}) {
    instrumentation.setConfig(config);
  }
  // For these tests, mongo must be running. Add RUN_MONGODB_TESTS to run
  // these tests.
  const RUN_MONGODB_TESTS = process.env.RUN_MONGODB_TESTS as string;
  let shouldTest = true;
  if (!RUN_MONGODB_TESTS) {
    console.log('Skipping test-mongodb. Run MongoDB to test');
    shouldTest = false;
  }

  const URL = `mongodb://${process.env.MONGODB_HOST || DEFAULT_MONGO_HOST}:${
    process.env.MONGODB_PORT || '27017'
  }`;
  const DB_NAME = process.env.MONGODB_DB || 'opentelemetry-tests';
  const COLLECTION_NAME = 'test';

  let client: mongodb.MongoClient;
  let collection: mongodb.Collection;

  before(done => {
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

  beforeEach(function mongoBeforeEach(done) {
    // Skipping all tests in beforeEach() is a workaround. Mocha does not work
    // properly when skipping tests in before() on nested describe() calls.
    // https://github.com/mochajs/mocha/issues/2819
    if (!shouldTest) {
      this.skip();
    }
    // Non traced insertion of basic data to perform tests
    const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
    collection.insertMany(insertData, (err, result) => {
      resetMemoryExporter();
      done();
    });
  });

  afterEach(done => {
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
    it('should create a child span for insert', done => {
      const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
      const span = trace.getTracer('default').startSpan('insertRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.insertMany(insertData, (err, result) => {
          span.end();
          assert.ifError(err);
          assertSpans(getTestSpans(), 'mongodb.insert', SpanKind.CLIENT);
          done();
        });
      });
    });

    it('should create a child span for update', done => {
      const span = trace.getTracer('default').startSpan('updateRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.updateOne({ a: 2 }, { $set: { b: 1 } }, (err, result) => {
          span.end();
          assert.ifError(err);
          assertSpans(getTestSpans(), 'mongodb.update', SpanKind.CLIENT);
          done();
        });
      });
    });

    it('should create a child span for remove', done => {
      const span = trace.getTracer('default').startSpan('removeRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.deleteOne({ a: 3 }, (err, result) => {
          span.end();
          assert.ifError(err);
          assertSpans(getTestSpans(), 'mongodb.remove', SpanKind.CLIENT);
          done();
        });
      });
    });
  });

  /** Should intercept cursor */
  describe('Instrumenting cursor operations', () => {
    it('should create a child span for find', done => {
      const span = trace.getTracer('default').startSpan('findRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.find({ a: 1 }).toArray((err, result) => {
          span.end();
          assert.ifError(err);
          assertSpans(getTestSpans(), 'mongodb.find', SpanKind.CLIENT);
          done();
        });
      });
    });
    it('should create a child span for cursor operations', done => {
      const span = trace.getTracer('default').startSpan('findRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        const cursor = collection.find().batchSize(1);
        cursor.next().then(firstElement => {
          assert(firstElement !== null);
          cursor.next().then(secondElement => {
            span.end();
            assert(secondElement !== null);
            // assert that we correctly got the first as a find
            assertSpans(
              getTestSpans().filter(
                span => !span.name.includes('mongodb.getMore')
              ),
              'mongodb.find',
              SpanKind.CLIENT
            );
            // assert that we correctly got the first as a find
            assertSpans(
              getTestSpans().filter(
                span => !span.name.includes('mongodb.find')
              ),
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
    it('should create a child span for create index', done => {
      const span = trace.getTracer('default').startSpan('indexRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.createIndex({ a: 1 }, (err, result) => {
          span.end();
          assert.ifError(err);
          assertSpans(getTestSpans(), 'mongodb.createIndexes', SpanKind.CLIENT);
          done();
        });
      });
    });
  });

  describe('when using enhanced database reporting without db statementSerializer', () => {
    const key = 'key';
    const value = 'value';
    const object = { [key]: value };

    beforeEach(() => {
      create({
        enhancedDatabaseReporting: false,
      });
    });

    it('should properly collect db statement (hide attribute values)', done => {
      const span = trace.getTracer('default').startSpan('insertRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.insertOne(object).then(() => {
          span.end();
          const spans = getTestSpans();
          const operationName = 'mongodb.insert';
          assertSpans(spans, operationName, SpanKind.CLIENT, false, false);
          const mongoSpan = spans.find(s => s.name === operationName);
          const dbStatement = JSON.parse(
            mongoSpan!.attributes[SemanticAttributes.DB_STATEMENT] as string
          );
          assert.strictEqual(dbStatement[key], '?');
          done();
        });
      });
    });
  });

  describe('when specifying a dbStatementSerializer configuration', () => {
    const key = 'key';
    const value = 'value';
    const object = { [key]: value };

    describe('with a valid function', () => {
      beforeEach(() => {
        create({
          dbStatementSerializer: (commandObj: Record<string, unknown>) => {
            return JSON.stringify(commandObj);
          },
        });
      });

      it('should properly collect db statement', done => {
        const span = trace.getTracer('default').startSpan('insertRootSpan');
        context.with(trace.setSpan(context.active(), span), () => {
          collection.insertOne(object).then(() => {
            span.end();
            const spans = getTestSpans();
            const operationName = 'mongodb.insert';
            assertSpans(spans, operationName, SpanKind.CLIENT, false, true);
            const mongoSpan = spans.find(s => s.name === operationName);
            const dbStatement = JSON.parse(
              mongoSpan!.attributes[SemanticAttributes.DB_STATEMENT] as string
            );
            assert.strictEqual(dbStatement[key], value);
            done();
          });
        });
      });
    });

    describe('with an invalid function', () => {
      beforeEach(() => {
        create({
          enhancedDatabaseReporting: true,
          dbStatementSerializer: (_commandObj: Record<string, unknown>) => {
            throw new Error('something went wrong!');
          },
        });
      });

      it('should not do any harm when throwing an exception', done => {
        const span = trace.getTracer('default').startSpan('insertRootSpan');
        context.with(trace.setSpan(context.active(), span), () => {
          collection.insertOne(object).then(() => {
            span.end();
            const spans = getTestSpans();
            assertSpans(spans, 'mongodb.insert', SpanKind.CLIENT);
            done();
          });
        });
      });
    });
  });

  describe('when specifying a responseHook configuration', () => {
    const dataAttributeName = 'mongodb_data';
    describe('with a valid function', () => {
      beforeEach(() => {
        create({
          responseHook: (span: Span, result: MongoResponseHookInformation) => {
            span.setAttribute(
              dataAttributeName,
              JSON.stringify(result.data.result)
            );
          },
        });
      });

      it('should attach response hook data to the resulting span for insert function', done => {
        const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
        const span = trace.getTracer('default').startSpan('insertRootSpan');
        context.with(trace.setSpan(context.active(), span), () => {
          collection.insertMany(insertData, (err, results) => {
            span.end();
            assert.ifError(err);
            const spans = getTestSpans();
            const insertSpan = spans[0];

            assert.deepStrictEqual(
              JSON.parse(insertSpan.attributes[dataAttributeName] as string),
              (<any>results)?.result
            );

            done();
          });
        });
      });

      it('should attach response hook data to the resulting span for find function', done => {
        const span = trace.getTracer('default').startSpan('findRootSpan');
        context.with(trace.setSpan(context.active(), span), () => {
          collection.find({ a: 1 }).toArray((err, results) => {
            span.end();
            assert.ifError(err);
            const spans = getTestSpans();
            const findSpan = spans[0];
            const hookAttributeValue = JSON.parse(
              findSpan.attributes[dataAttributeName] as string
            );

            if (results) {
              assert.strictEqual(
                hookAttributeValue?.cursor?.firstBatch[0]._id,
                results[0]._id.toString()
              );
            } else {
              throw new Error('Got an unexpected Results: ' + results);
            }
            done();
          });
        });
      });
    });
    describe('with an invalid function', () => {
      beforeEach(() => {
        create({
          responseHook: (span: Span, result: MongoResponseHookInformation) => {
            throw 'some error';
          },
        });
      });
      it('should not do any harm when throwing an exception', done => {
        const span = trace.getTracer('default').startSpan('findRootSpan');
        context.with(trace.setSpan(context.active(), span), () => {
          collection.find({ a: 1 }).toArray((err, results) => {
            span.end();
            const spans = getTestSpans();

            assert.ifError(err);
            assertSpans(spans, 'mongodb.find', SpanKind.CLIENT);
            done();
          });
        });
      });
    });
  });
  describe('Mixed operations with callback', () => {
    it('should create a span for find after callback insert', done => {
      const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
      const span = trace.getTracer('default').startSpan('insertRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.insertMany(insertData, (err, result) => {
          span.end();
          assert.ifError(err);
          const spans = getTestSpans();
          const mainSpan = spans[spans.length - 1];
          assertSpans(spans, 'mongodb.insert', SpanKind.CLIENT);
          resetMemoryExporter();

          collection.find({ a: 1 }).toArray((err, result) => {
            const spans2 = getTestSpans();
            spans2.push(mainSpan);

            assert.ifError(err);
            assertSpans(spans2, 'mongodb.find', SpanKind.CLIENT);
            assert.strictEqual(
              mainSpan.spanContext().spanId,
              spans2[0].parentSpanId
            );
            done();
          });
        });
      });
    });
  });

  describe('MongoDb useUnifiedTopology enabled', () => {
    let client: mongodb.MongoClient;
    let collection: mongodb.Collection;
    before(done => {
      accessCollection(URL, DB_NAME, COLLECTION_NAME, {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        useUnifiedTopology: true,
      })
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
      if (client) {
        client.close();
      }
    });
    it('should generate correct span attributes', done => {
      const span = trace.getTracer('default').startSpan('findRootSpan');
      context.with(trace.setSpan(context.active(), span), () => {
        collection.find({ a: 1 }).toArray((err, results) => {
          span.end();
          const [mongoSpan] = getTestSpans();
          assert.ifError(err);
          lookup(
            process.env.MONGODB_HOST || DEFAULT_MONGO_HOST,
            (err, address) => {
              if (err) return done(err);
              assert.strictEqual(
                mongoSpan.attributes[SemanticAttributes.NET_HOST_NAME],
                address
              );
              assert.strictEqual(
                mongoSpan.attributes[SemanticAttributes.NET_HOST_PORT],
                process.env.MONGODB_PORT || '27017'
              );
              done();
            }
          );
        });
      });
    });
  });

  /** Should intercept command */
  describe('Removing Instrumentation', () => {
    it('should unpatch plugin', () => {
      assert.doesNotThrow(() => {
        instrumentation.disable();
      });
    });

    it('should not create a child span for query', done => {
      const insertData = [{ a: 1 }, { a: 2 }, { a: 3 }];
      const span = trace.getTracer('default').startSpan('insertRootSpan');
      collection.insertMany(insertData, (err, result) => {
        span.end();
        assert.ifError(err);
        assert.strictEqual(getTestSpans().length, 1);
        done();
      });
    });

    it('should not create a child span for cursor', done => {
      const span = trace.getTracer('default').startSpan('findRootSpan');
      collection.find({}).toArray((err, result) => {
        span.end();
        assert.ifError(err);
        assert.strictEqual(getTestSpans().length, 1);
        done();
      });
    });

    it('should not create a child span for command', done => {
      const span = trace.getTracer('default').startSpan('indexRootSpan');
      collection.createIndex({ a: 1 }, (err, result) => {
        span.end();
        assert.ifError(err);
        assert.strictEqual(getTestSpans().length, 1);
        done();
      });
    });
  });
});
