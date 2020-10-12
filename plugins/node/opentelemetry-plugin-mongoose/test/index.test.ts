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

import { MongoosePlugin, plugin } from '../src';
import { AttributeNames } from '../src/enums';
import { NoopLogger } from '@opentelemetry/core';
import { NodeTracerProvider } from '@opentelemetry/node';
import { CanonicalCode, Span } from '@opentelemetry/api';

import * as mongoose from 'mongoose';

const logger = new NoopLogger();
const provider = new NodeTracerProvider();

import User, { UserInterface } from './user';

import { context } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';

import { assertSpan } from './asserts';

describe('mongoose opentelemetry plugin', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
    });
  });

  after(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await User.insertMany([
      new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        age: 18,
      }),
      new User({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@example.com',
        age: 19,
      }),
      new User({
        firstName: 'Michael',
        lastName: 'Fox',
        email: 'michael.fox@example.com',
        age: 16,
      }),
    ]);

    await User.createIndexes();
  });

  afterEach(async () => {
    await User.collection.drop();
  });

  describe('Trace', () => {
    let contextManager: AsyncHooksContextManager;
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider.addSpanProcessor(spanProcessor);

    beforeEach(() => {
      plugin.enable(mongoose, provider, logger);
    });

    afterEach(() => {
      plugin.disable();
    });

    beforeEach(() => {
      memoryExporter.reset();
      contextManager = new AsyncHooksContextManager().enable();
      context.setGlobalContextManager(contextManager);
    });

    afterEach(() => {
      contextManager.disable();
    });

    it('should export a plugin', () => {
      assert.strictEqual(plugin instanceof MongoosePlugin, true);
    });

    it('instrumenting save operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider
        .getTracer('default')
        .withSpan(span, () => {
          const user: UserInterface = new User({
            firstName: 'Test first name',
            lastName: 'Test last name',
            email: 'test@example.com',
          });

          return user.save();
        })
        .then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0]);

          assert.strictEqual(spans[0].status.code, CanonicalCode.OK);

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'save'
          );

          done();
        });
    });

    it('instrumenting save operation with callback', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        const user: UserInterface = new User({
          firstName: 'Test first name',
          lastName: 'Test last name',
          email: 'test@example.com',
        });

        user.save(err => {
          assert.ifError(err);

          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0]);

          assert.strictEqual(spans[0].status.code, CanonicalCode.OK);

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'save'
          );

          done();
        });
      });
    });

    it('instrumenting error on save operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider
        .getTracer('default')
        .withSpan(span, () => {
          const user: UserInterface = new User({
            firstName: 'Test first name',
            lastName: 'Test last name',
            email: 'john.doe@example.com',
          });

          return user.save();
        })
        .then(a => {
          assert.fail('should not be possible');
        })
        .catch(err => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assertSpan(spans[0]);

          assert.strictEqual(spans[0].status.code, CanonicalCode.UNKNOWN);

          assert.strictEqual(
            spans[0].attributes[AttributeNames.MONGO_ERROR_CODE],
            11000
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'save'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.COLLECTION_NAME],
            'users'
          );

          done();
        });
    });

    it('instrumenting error on save operation with callbacks', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        const user: UserInterface = new User({
          firstName: 'Test first name',
          lastName: 'Test last name',
          email: 'john.doe@example.com',
        });

        user.save(err => {
          if (err) {
            const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

            assert.strictEqual(spans.length, 1);

            assertSpan(spans[0]);

            assert.strictEqual(spans[0].status.code, CanonicalCode.UNKNOWN);

            assert.strictEqual(
              spans[0].attributes[AttributeNames.MONGO_ERROR_CODE],
              11000
            );
            assert.strictEqual(
              spans[0].attributes[AttributeNames.DB_MODEL_NAME],
              'User'
            );
            assert.strictEqual(
              spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
              'save'
            );

            assert.strictEqual(
              spans[0].attributes[AttributeNames.COLLECTION_NAME],
              'users'
            );

            return done();
          }

          assert.fail('should not be possible');
        });
      });
    });

    it('instrumenting find operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.find({ id: '_test' }).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assertSpan(spans[0]);
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'find'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{"id":"_test"}'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.COLLECTION_NAME],
            'users'
          );

          done();
        });
      });
    });

    it('instrumenting multiple find operations', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        Promise.all([
          User.find({ id: '_test1' }),
          User.find({ id: '_test2' }),
        ]).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(spans.length, 2);

          assertSpan(spans[0]);
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'find'
          );

          assert.strictEqual(
            /^{"id":"_test[1-2]"}$/.test(
              String(spans[0].attributes[AttributeNames.DB_STATEMENT])
            ),
            true
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.COLLECTION_NAME],
            'users'
          );

          assertSpan(spans[1]);
          assert.strictEqual(
            spans[1].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[1].attributes[AttributeNames.DB_QUERY_TYPE],
            'find'
          );

          assert.strictEqual(
            /^{"id":"_test[1-2]"}$/.test(
              String(spans[1].attributes[AttributeNames.DB_STATEMENT])
            ),
            true
          );

          assert.strictEqual(
            spans[1].attributes[AttributeNames.COLLECTION_NAME],
            'users'
          );

          done();
        });
      });
    });

    it('instrumenting find operation with chaining structures', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.find({ id: '_test' })
          .skip(1)
          .limit(2)
          .sort({ email: 'asc' })
          .then(() => {
            const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

            assertSpan(spans[0]);
            assert.strictEqual(
              spans[0].attributes[AttributeNames.DB_MODEL_NAME],
              'User'
            );
            assert.strictEqual(
              spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
              'find'
            );

            assert.strictEqual(
              spans[0].attributes[AttributeNames.DB_STATEMENT],
              '{"id":"_test"}'
            );

            assert.strictEqual(
              spans[0].attributes[AttributeNames.COLLECTION_NAME],
              'users'
            );

            done();
          });
      });
    });

    it('instrumenting remove operation [deprecated]', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.findOne({ email: 'john.doe@example.com' })
          .then((user: any) => {
            return user!.remove();
          })
          .then(() => {
            const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

            assert.strictEqual(
              spans[1].attributes[AttributeNames.DB_MODEL_NAME],
              'User'
            );
            assert.strictEqual(
              spans[1].attributes[AttributeNames.DB_QUERY_TYPE],
              'remove'
            );

            assert.strictEqual(
              spans[1].attributes[AttributeNames.COLLECTION_NAME],
              'users'
            );

            done();
          });
      });
    });

    it('instrumenting remove operation with callbacks [deprecated]', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, async () => {
        const user = await User.findOne({ email: 'john.doe@example.com' });
        user!.remove((error: Error | null, user: any) => {
          assert.ifError(error);

          assert.notStrictEqual(user, null);

          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(
            spans[1].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[1].attributes[AttributeNames.DB_QUERY_TYPE],
            'remove'
          );

          assert.strictEqual(
            spans[1].attributes[AttributeNames.COLLECTION_NAME],
            'users'
          );

          done();
        });
      });
    });

    it('instrumenting deleteOne operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.deleteOne({ email: 'john.doe@example.com' }).then((op: any) => {
          assert.strictEqual(op.deletedCount, 1);
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(spans.length, 1);

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'deleteOne'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{"email":"john.doe@example.com"}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_UPDATE],
            undefined
          );
          done();
        });
      });
    });

    it('instrumenting updateOne operation on models', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.findOne({ email: 'john.doe@example.com' })
          .then((user: any) => user!.updateOne({ $inc: { age: 1 } }, { w: 1 }))
          .then(() => {
            const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

            assert.strictEqual(
              spans[1].attributes[AttributeNames.DB_MODEL_NAME],
              'User'
            );
            assert.strictEqual(
              spans[1].attributes[AttributeNames.DB_QUERY_TYPE],
              'updateOne'
            );

            assert.strictEqual(
              /{"_id":"\w+"}/.test(
                String(spans[1].attributes[AttributeNames.DB_STATEMENT])
              ),
              true
            );
            assert.strictEqual(
              spans[1].attributes[AttributeNames.DB_OPTIONS],
              '{"w":1}'
            );
            assert.strictEqual(
              spans[1].attributes[AttributeNames.DB_UPDATE],
              '{"$inc":{"age":1}}'
            );

            assert.strictEqual(
              spans[1].attributes[AttributeNames.COLLECTION_NAME],
              'users'
            );

            done();
          });
      });
    });

    it('instrumenting updateOne operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.updateOne(
          { email: 'john.doe@example.com' },
          { $inc: { age: 1 } }
        ).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'updateOne'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{"email":"john.doe@example.com"}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_UPDATE],
            '{"$inc":{"age":1}}'
          );
          done();
        });
      });
    });

    it('instrumenting count operation [deprecated]', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.count({}).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'count'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_UPDATE],
            undefined
          );
          done();
        });
      });
    });

    it('instrumenting countDocuments operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.countDocuments({}).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(spans.length, 1);

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'countDocuments'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_UPDATE],
            undefined
          );
          done();
        });
      });
    });

    it('instrumenting estimatedDocumentCount operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.estimatedDocumentCount({}).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(spans.length, 1);

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'estimatedDocumentCount'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_UPDATE],
            undefined
          );
          done();
        });
      });
    });

    it('instrumenting deleteMany operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.deleteMany({}).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'deleteMany'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_UPDATE],
            undefined
          );
          done();
        });
      });
    });

    it('instrumenting findOne operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.findOne({ email: 'john.doe@example.com' }).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'findOne'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{"email":"john.doe@example.com"}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_UPDATE],
            undefined
          );
          done();
        });
      });
    });

    it('instrumenting update operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.update(
          { email: 'john.doe@example.com' },
          { email: 'john.doe2@example.com' }
        ).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'update'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{"email":"john.doe@example.com"}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_UPDATE],
            '{"email":"john.doe2@example.com"}'
          );
          done();
        });
      });
    });

    it('instrumenting updateMany operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.updateMany({ age: 18 }, { isDeleted: true }).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'updateMany'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{"age":18}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_UPDATE],
            '{"isDeleted":true}'
          );
          done();
        });
      });
    });

    it('instrumenting findOneAndDelete operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.findOneAndDelete({ email: 'john.doe@example.com' }).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(spans.length, 1);

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'findOneAndDelete'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{"email":"john.doe@example.com"}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_UPDATE],
            undefined
          );
          done();
        });
      });
    });

    it('instrumenting findOneAndUpdate operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.findOneAndUpdate(
          { email: 'john.doe@example.com' },
          { isUpdated: true }
        ).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(spans.length, 2);

          assert.strictEqual(
            spans[1].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[1].attributes[AttributeNames.DB_QUERY_TYPE],
            'findOneAndUpdate'
          );

          assert.strictEqual(
            spans[1].attributes[AttributeNames.DB_STATEMENT],
            '{"email":"john.doe@example.com"}'
          );
          assert.strictEqual(
            spans[1].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[1].attributes[AttributeNames.DB_UPDATE],
            '{"isUpdated":true}'
          );

          done();
        });
      });
    });

    it('instrumenting findOneAndRemove operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.findOneAndRemove({ email: 'john.doe@example.com' }).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(spans.length, 1);

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'findOneAndRemove'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_STATEMENT],
            '{"email":"john.doe@example.com"}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_OPTIONS],
            '{}'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_UPDATE],
            undefined
          );

          done();
        });
      });
    });

    it('instrumenting create operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.create({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe+1@example.com',
        }).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0]);

          assert.strictEqual(spans[0].status.code, CanonicalCode.OK);

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'save'
          );

          done();
        });
      });
    });

    it('instrumenting aggregate operation', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.aggregate([
          { $match: { firstName: 'John' } },
          { $group: { _id: 'John', total: { $sum: '$amount' } } },
        ]).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assertSpan(spans[0]);
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
            'aggregate'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_AGGREGATE_PIPELINE],
            '[{"$match":{"firstName":"John"}},{"$group":{"_id":"John","total":{"$sum":"$amount"}}}]'
          );

          assert.strictEqual(
            spans[0].attributes[AttributeNames.COLLECTION_NAME],
            'users'
          );

          done();
        });
      });
    });

    it('instrumenting aggregate with callback', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.aggregate(
          [
            { $match: { firstName: 'John' } },
            { $group: { _id: 'John', total: { $sum: '$amount' } } },
          ],
          (error: Error | null, result: any) => {
            assert.ifError(error);
            assert.notStrictEqual(result, null);

            const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

            assertSpan(spans[0]);
            assert.strictEqual(
              spans[0].attributes[AttributeNames.DB_MODEL_NAME],
              'User'
            );
            assert.strictEqual(
              spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
              'aggregate'
            );

            assert.strictEqual(
              spans[0].attributes[AttributeNames.DB_AGGREGATE_PIPELINE],
              '[{"$match":{"firstName":"John"}},{"$group":{"_id":"John","total":{"$sum":"$amount"}}}]'
            );

            assert.strictEqual(
              spans[0].attributes[AttributeNames.COLLECTION_NAME],
              'users'
            );

            done();
          }
        );
      });
    });

    it('instrumenting aggregate with await', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, async () => {
        await User.aggregate([
          { $match: { firstName: 'John' } },
          { $group: { _id: 'John', total: { $sum: '$amount' } } },
        ]);

        const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();
        // check linked to parent span correctly
        assert.strictEqual(spans[0].parentSpanId, span.context().spanId);

        assertSpan(spans[0]);
        assert.strictEqual(
          spans[0].attributes[AttributeNames.DB_MODEL_NAME],
          'User'
        );
        assert.strictEqual(
          spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
          'aggregate'
        );

        assert.strictEqual(
          spans[0].attributes[AttributeNames.DB_AGGREGATE_PIPELINE],
          '[{"$match":{"firstName":"John"}},{"$group":{"_id":"John","total":{"$sum":"$amount"}}}]'
        );

        assert.strictEqual(
          spans[0].attributes[AttributeNames.COLLECTION_NAME],
          'users'
        );

        done();
      });
    });

    it('await on mongoose thenable query object', done => {
      const initSpan: Span = provider
        .getTracer('default')
        .startSpan('test span');
      provider.getTracer('default').withSpan(initSpan, async () => {
        await User.findOne({ id: '_test' });

        const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        const mongooseSpan: ReadableSpan = spans[0];

        // validate the the mongoose span is the child of the span the initiated the call
        assert.strictEqual(
          mongooseSpan.spanContext.traceId,
          initSpan.context().traceId
        );
        assert.strictEqual(
          mongooseSpan.parentSpanId,
          initSpan.context().spanId
        );

        assertSpan(mongooseSpan);
        assert.strictEqual(
          mongooseSpan.attributes[AttributeNames.DB_MODEL_NAME],
          'User'
        );
        assert.strictEqual(
          mongooseSpan.attributes[AttributeNames.DB_QUERY_TYPE],
          'findOne'
        );

        assert.strictEqual(
          mongooseSpan.attributes[AttributeNames.DB_STATEMENT],
          '{"id":"_test"}'
        );

        assert.strictEqual(
          mongooseSpan.attributes[AttributeNames.COLLECTION_NAME],
          'users'
        );

        done();
      });
    });

    it('instrumenting combined operation with Promise.all', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        Promise.all([
          User.find({ id: '_test' }).skip(1).limit(2).sort({ email: 'asc' }),
          User.countDocuments(),
        ]).then(users => {
          // close the root span
          span.end();

          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          // same traceId assertion
          assert.strictEqual(
            [
              ...new Set(
                spans.map((span: ReadableSpan) => span.spanContext.traceId)
              ),
            ].length,
            1
          );

          assert.strictEqual(spans.length, 3);

          assertSpan(spans[0]);
          assertSpan(spans[1]);

          assert.strictEqual(
            spans[0].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            /^(find|countDocuments)$/.test(
              String(spans[0].attributes[AttributeNames.DB_QUERY_TYPE])
            ),
            true
          );

          assert.strictEqual(
            spans[1].attributes[AttributeNames.DB_MODEL_NAME],
            'User'
          );
          assert.strictEqual(
            /^(find|countDocuments)$/.test(
              String(spans[1].attributes[AttributeNames.DB_QUERY_TYPE])
            ),
            true
          );

          done();
        });
      });
    });

    it('instrumenting combined operation with async/await', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, async () => {
        await User.find({ id: '_test' })
          .skip(1)
          .limit(2)
          .sort({ email: 'asc' });
        // close the root span
        span.end();

        const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

        assert.strictEqual(spans.length, 2);

        // same traceId assertion
        assert.strictEqual(
          [
            ...new Set(
              spans.map((span: ReadableSpan) => span.spanContext.traceId)
            ),
          ].length,
          1
        );

        assertSpan(spans[0]);

        assert.strictEqual(
          spans[0].attributes[AttributeNames.DB_MODEL_NAME],
          'User'
        );
        assert.strictEqual(
          spans[0].attributes[AttributeNames.DB_QUERY_TYPE],
          'find'
        );

        done();
      });
    });
  });

  describe('Trace with enhancedDatabaseReporting', () => {
    let contextManager: AsyncHooksContextManager;
    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    provider.addSpanProcessor(spanProcessor);

    beforeEach(() => {
      plugin.enable(mongoose, provider, logger, {
        enhancedDatabaseReporting: true,
      });
    });

    afterEach(() => {
      plugin.disable();
    });

    beforeEach(() => {
      memoryExporter.reset();
      contextManager = new AsyncHooksContextManager().enable();
      context.setGlobalContextManager(contextManager);
    });

    afterEach(() => {
      contextManager.disable();
    });

    it('Save operation traces save data', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        const payload = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe+1@example.com',
        };
        User.create(payload).then(() => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();

          assert.strictEqual(spans.length, 1);
          assertSpan(spans[0]);

          const saveData = JSON.parse(
            spans[0].attributes[AttributeNames.DB_SAVE] as string
          );
          assert.strictEqual(saveData.firstName, payload.firstName);
          assert.strictEqual(saveData.lastName, payload.lastName);
          assert.strictEqual(saveData.email, payload.email);
          assert.notDeepStrictEqual(saveData._id, null);
          assert.notDeepStrictEqual(saveData._id, undefined);

          done();
        });
      });
    });

    it('find operation traces query response', done => {
      const span = provider.getTracer('default').startSpan('test span');
      provider.getTracer('default').withSpan(span, () => {
        User.find({}).then((users: any) => {
          const spans: ReadableSpan[] = memoryExporter.getFinishedSpans();
          assertSpan(spans[0]);
          assert.strictEqual(
            JSON.stringify(users),
            spans[0].attributes[AttributeNames.DB_RESPONSE] as string
          );

          done();
        });
      });
    });
  });
});
