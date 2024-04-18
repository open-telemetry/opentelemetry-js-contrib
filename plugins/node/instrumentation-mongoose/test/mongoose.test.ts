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
import 'mocha';
import { expect } from 'expect';
import { context, ROOT_CONTEXT } from '@opentelemetry/api';
import {
  SEMATTRS_DB_OPERATION,
  SEMATTRS_DB_STATEMENT,
} from '@opentelemetry/semantic-conventions';
import { MongooseInstrumentation } from '../src';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

const instrumentation = registerInstrumentationTesting(
  new MongooseInstrumentation()
);

import * as mongoose from 'mongoose';
import User, { IUser, loadUsers } from './user';
import { assertSpan, getStatement } from './asserts';
import { DB_NAME, MONGO_URI } from './config';

// Please run mongodb in the background: docker run -d -p 27017:27017 -v ~/data:/data/db mongo
describe('mongoose instrumentation', () => {
  before(async () => {
    try {
      await mongoose.connect(MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useFindAndModify: false,
        useCreateIndex: true,
        dbName: DB_NAME,
      } as any); // TODO: amir - document older mongoose support
    } catch (err: any) {
      // connect signature changed from mongo v5 to v6.
      // the following check tries both signatures, so test-all-versions
      // can run against both versions.
      if (err?.name === 'MongoParseError') {
        await mongoose.connect(MONGO_URI, {
          dbName: DB_NAME,
        }); // TODO: amir - document older mongoose support
      }
    }
  });

  after(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    instrumentation.disable();
    instrumentation.setConfig({
      dbStatementSerializer: (_operation: string, payload) =>
        JSON.stringify(payload),
    });
    instrumentation.enable();
    await loadUsers();
    await User.createIndexes();
  });

  afterEach(async () => {
    instrumentation.disable();
    await User.collection.drop().catch();
  });

  it('instrumenting save operation with promise', async () => {
    const document = {
      firstName: 'Test first name',
      lastName: 'Test last name',
      email: 'test@example.com',
    };
    const user: IUser = new User(document);

    await user.save();

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('save');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.document).toEqual(expect.objectContaining(document));
  });

  it('instrumenting save operation with callback', done => {
    const document = {
      firstName: 'Test first name',
      lastName: 'Test last name',
      email: 'test@example.com',
    };
    const user: IUser = new User(document);

    user.save(() => {
      const spans = getTestSpans();

      expect(spans.length).toBe(1);
      assertSpan(spans[0] as ReadableSpan);
      expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('save');
      const statement = getStatement(spans[0] as ReadableSpan);
      expect(statement.document).toEqual(expect.objectContaining(document));
      done();
    });
  });

  it('instrumenting find operation', async () => {
    await User.find({ id: '_test' });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('find');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.condition).toEqual({ id: '_test' });
  });

  it('instrumenting multiple find operations', async () => {
    await Promise.all([
      User.find({ id: '_test1' }),
      User.find({ id: '_test2' }),
    ]);

    const spans = getTestSpans();
    expect(spans.length).toBe(2);
    assertSpan(spans[0] as ReadableSpan);
    assertSpan(spans[1] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('find');
    expect(spans[0].attributes[SEMATTRS_DB_STATEMENT]).toMatch(
      /.*{"id":"_test[1-2]"}.*/g
    );
    expect(spans[1].attributes[SEMATTRS_DB_OPERATION]).toBe('find');
    expect(spans[1].attributes[SEMATTRS_DB_STATEMENT]).toMatch(
      /.*{"id":"_test[1-2]"}.*/g
    );
  });

  it('instrumenting find operation with chaining structures', async () => {
    await User.find({ id: '_test' }).skip(1).limit(2).sort({ email: 'asc' });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('find');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.condition).toEqual({ id: '_test' });
    expect(statement.options).toEqual({
      skip: 1,
      limit: 2,
      sort: { email: 1 },
    });
  });

  it('instrumenting remove operation [deprecated]', async () => {
    const user = await User.findOne({ email: 'john.doe@example.com' });
    await user!.remove();

    const spans = getTestSpans();
    expect(spans.length).toBe(2);
    assertSpan(spans[1] as ReadableSpan);
    expect(spans[1].attributes[SEMATTRS_DB_OPERATION]).toBe('remove');
  });

  it('instrumenting remove operation with callbacks [deprecated]', done => {
    User.findOne({ email: 'john.doe@example.com' }).then(user =>
      user!.remove({ overwrite: true }, () => {
        const spans = getTestSpans();
        expect(spans.length).toBe(2);
        assertSpan(spans[1] as ReadableSpan);
        expect(spans[1].attributes[SEMATTRS_DB_OPERATION]).toBe('remove');
        expect(getStatement(spans[1] as ReadableSpan).options).toEqual({
          overwrite: true,
        });
        done();
      })
    );
  });

  it('instrumenting deleteOne operation', async () => {
    await User.deleteOne({ email: 'john.doe@example.com' });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('deleteOne');
  });

  it('instrumenting updateOne operation on models', async () => {
    const user = await User.findOne({ email: 'john.doe@example.com' });
    await user!.updateOne({ $inc: { age: 1 } }, { skip: 0 });

    const spans = getTestSpans();
    expect(spans.length).toBe(2);
    assertSpan(spans[1] as ReadableSpan);
    expect(spans[1].attributes[SEMATTRS_DB_OPERATION]).toBe('updateOne');

    const statement = getStatement(spans[1] as ReadableSpan);
    expect(statement.options).toEqual({ skip: 0 });
    expect(statement.updates).toEqual({ $inc: { age: 1 } });
    expect(statement.condition._id).toBeDefined();
  });

  it('instrumenting updateOne operation', async () => {
    await User.updateOne(
      { email: 'john.doe@example.com' },
      { $inc: { age: 1 } },
      { skip: 0 }
    );

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('updateOne');

    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({ skip: 0 });
    expect(statement.updates).toEqual({ $inc: { age: 1 } });
    expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
  });

  it('instrumenting count operation [deprecated]', async () => {
    await User.count({});

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('count');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({});
  });

  it('instrumenting countDocuments operation', async () => {
    await User.countDocuments({ email: 'john.doe@example.com' });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('countDocuments');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
  });

  it('instrumenting estimatedDocumentCount operation', async () => {
    await User.estimatedDocumentCount();

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe(
      'estimatedDocumentCount'
    );
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({});
  });

  it('instrumenting deleteMany operation', async () => {
    await User.deleteMany();

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('deleteMany');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({});
  });

  it('instrumenting findOne operation', async () => {
    await User.findOne({ email: 'john.doe@example.com' });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('findOne');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
  });

  it('instrumenting update operation [deprecated]', async () => {
    await User.update(
      { email: 'john.doe@example.com' },
      { email: 'john.doe2@example.com' }
    );

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('update');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
    expect(statement.updates).toEqual({ email: 'john.doe2@example.com' });
  });

  it('instrumenting updateOne operation', async () => {
    await User.updateOne({ email: 'john.doe@example.com' }, { age: 55 });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('updateOne');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
    expect(statement.updates).toEqual({ age: 55 });
  });

  it('instrumenting updateMany operation', async () => {
    await User.updateMany({ age: 18 }, { isDeleted: true });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('updateMany');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({ age: 18 });
    expect(statement.updates).toEqual({ isDeleted: true });
  });

  it('instrumenting findOneAndDelete operation', async () => {
    await User.findOneAndDelete({ email: 'john.doe@example.com' });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('findOneAndDelete');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
  });

  it('instrumenting findOneAndUpdate operation', async () => {
    await User.findOneAndUpdate(
      { email: 'john.doe@example.com' },
      { isUpdated: true }
    );

    const spans = getTestSpans();
    expect(spans.length).toBe(2);
    assertSpan(spans[0] as ReadableSpan);
    assertSpan(spans[1] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('findOne');
    expect(spans[1].attributes[SEMATTRS_DB_OPERATION]).toBe('findOneAndUpdate');
    const statement = getStatement(spans[1] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
    expect(statement.updates).toEqual({ isUpdated: true });
  });

  it('instrumenting findOneAndRemove operation', async () => {
    await User.findOneAndRemove({ email: 'john.doe@example.com' });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('findOneAndRemove');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
  });

  it('instrumenting create operation', async () => {
    const document = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe+1@example.com',
    };
    await User.create(document);

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('save');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.document).toEqual(expect.objectContaining(document));
  });

  it('instrumenting aggregate operation', async () => {
    await User.aggregate([
      { $match: { firstName: 'John' } },
      { $group: { _id: 'John', total: { $sum: '$amount' } } },
    ]);

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('aggregate');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.aggregatePipeline).toEqual([
      { $match: { firstName: 'John' } },
      { $group: { _id: 'John', total: { $sum: '$amount' } } },
    ]);
  });

  it('instrumenting aggregate operation with callback', done => {
    User.aggregate(
      [
        { $match: { firstName: 'John' } },
        { $group: { _id: 'John', total: { $sum: '$amount' } } },
      ],
      () => {
        const spans = getTestSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0] as ReadableSpan);
        expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('aggregate');
        const statement = getStatement(spans[0] as ReadableSpan);
        expect(statement.aggregatePipeline).toEqual([
          { $match: { firstName: 'John' } },
          { $group: { _id: 'John', total: { $sum: '$amount' } } },
        ]);
        done();
      }
    );
  });

  it('instrumenting combined operation with async/await', async () => {
    await User.find({ id: '_test' }).skip(1).limit(2).sort({ email: 'asc' });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.condition).toEqual({ id: '_test' });
    expect(statement.options).toEqual({
      skip: 1,
      limit: 2,
      sort: { email: 1 },
    });
  });

  it('empty dbStatementSerializer does not create a statement attribute', async () => {
    instrumentation.disable();
    instrumentation.setConfig({ dbStatementSerializer: undefined });
    instrumentation.enable();
    await User.find({ id: '_test' });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_STATEMENT]).toBe(undefined);
  });

  it('projection is sent to serializer', async () => {
    instrumentation.disable();
    instrumentation.setConfig({
      dbStatementSerializer: (_operation: string, payload) =>
        JSON.stringify(payload),
    });
    instrumentation.enable();

    const projection = { firstName: 1 };
    await User.find({ id: '_test1' }, projection);

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    const reqPayload = JSON.parse(
      spans[0].attributes[SEMATTRS_DB_STATEMENT] as string
    );
    expect(reqPayload.fields).toStrictEqual(projection);
  });

  describe('responseHook', () => {
    const RESPONSE = 'db.response';
    beforeEach(() => {
      instrumentation.disable();
      instrumentation.setConfig({
        responseHook: (span, responseInfo) =>
          span.setAttribute(RESPONSE, JSON.stringify(responseInfo.response)),
      });
      instrumentation.enable();
    });

    it('responseHook works with async/await in exec patch', async () => {
      await User.deleteOne({ email: 'john.doe@example.com' });
      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpan(spans[0] as ReadableSpan);
      expect(JSON.parse(spans[0].attributes[RESPONSE] as string)).toMatchObject(
        {
          deletedCount: 1,
        }
      );
    });

    it('responseHook works with callback in exec patch', done => {
      User.deleteOne({ email: 'john.doe@example.com' }, { lean: 1 }, () => {
        const spans = getTestSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0] as ReadableSpan);
        expect(
          JSON.parse(spans[0].attributes[RESPONSE] as string)
        ).toMatchObject({
          deletedCount: 1,
        });
        done();
      });
    });

    it('responseHook works with async/await in model methods patch', async () => {
      const document = {
        firstName: 'Test first name',
        lastName: 'Test last name',
        email: 'test@example.com',
      };
      const user: IUser = new User(document);
      const createdUser = await user.save();
      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpan(spans[0] as ReadableSpan);
      expect(spans[0].attributes[RESPONSE]).toEqual(
        JSON.stringify(createdUser)
      );
    });

    it('responseHook works with callback in model methods patch', done => {
      const document = {
        firstName: 'Test first name',
        lastName: 'Test last name',
        email: 'test@example.com',
      };
      const user: IUser = new User(document);
      user.save((_err, createdUser) => {
        const spans = getTestSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0] as ReadableSpan);
        expect(spans[0].attributes[RESPONSE]).toEqual(
          JSON.stringify(createdUser)
        );
        done();
      });
    });

    it('responseHook works with async/await in aggregate patch', async () => {
      await User.aggregate([
        { $match: { firstName: 'John' } },
        { $group: { _id: 'John', total: { $sum: '$amount' } } },
      ]);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpan(spans[0] as ReadableSpan);
      expect(JSON.parse(spans[0].attributes[RESPONSE] as string)).toEqual([
        { _id: 'John', total: 0 },
      ]);
    });

    it('responseHook works with callback in aggregate patch', done => {
      User.aggregate(
        [
          { $match: { firstName: 'John' } },
          { $group: { _id: 'John', total: { $sum: '$amount' } } },
        ],
        () => {
          const spans = getTestSpans();
          expect(spans.length).toBe(1);
          assertSpan(spans[0] as ReadableSpan);
          expect(JSON.parse(spans[0].attributes[RESPONSE] as string)).toEqual([
            { _id: 'John', total: 0 },
          ]);
          done();
        }
      );
    });

    it('error in response hook does not fail anything', async () => {
      instrumentation.disable();
      instrumentation.setConfig({
        responseHook: () => {
          throw new Error('some error');
        },
      });
      instrumentation.enable();
      await User.deleteOne({ email: 'john.doe@example.com' });
      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpan(spans[0] as ReadableSpan);
      expect(spans[0].attributes[RESPONSE]).toBe(undefined);
    });
  });

  describe('moduleVersion reporting on hook', () => {
    const VERSION_ATTR = 'module.version';
    beforeEach(() => {
      instrumentation.disable();
      instrumentation.setConfig({
        responseHook: (span, responseInfo) =>
          span.setAttribute(VERSION_ATTR, responseInfo.moduleVersion!),
      });
      instrumentation.enable();
    });

    it('exec patch', async () => {
      await User.deleteOne({ email: 'john.doe@example.com' });
      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpan(spans[0] as ReadableSpan);
      expect(spans[0].attributes[VERSION_ATTR]).toMatch(
        /\d{1,4}\.\d{1,4}\.\d{1,5}.*/
      );
    });

    it('model methods patch', async () => {
      const document = {
        firstName: 'Test first name',
        lastName: 'Test last name',
        email: 'test@example.com',
      };
      const user: IUser = new User(document);
      await user.save();
      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpan(spans[0] as ReadableSpan);
      expect(spans[0].attributes[VERSION_ATTR]).toMatch(
        /\d{1,4}\.\d{1,4}\.\d{1,5}.*/
      );
    });

    it('aggregate patch', async () => {
      await User.aggregate([
        { $match: { firstName: 'John' } },
        { $group: { _id: 'John', total: { $sum: '$amount' } } },
      ]);

      const spans = getTestSpans();
      expect(spans.length).toBe(1);
      assertSpan(spans[0] as ReadableSpan);
      expect(spans[0].attributes[VERSION_ATTR]).toMatch(
        /\d{1,4}\.\d{1,4}\.\d{1,5}.*/
      );
    });
  });

  describe('requireParentSpan', () => {
    beforeEach(() => {
      instrumentation.disable();
      instrumentation.setConfig({
        requireParentSpan: true,
      });
      instrumentation.enable();
    });

    it('should not start span on mongoose method', async () => {
      await context.with(ROOT_CONTEXT, async () => {
        const user: IUser = new User({
          firstName: 'Test first name',
          lastName: 'Test last name',
          email: 'test@example.com',
        });
        await user.save();
      });

      const spans = getTestSpans();
      expect(spans.length).toBe(0);
    });

    it('should not start span on find', async () => {
      await context.with(ROOT_CONTEXT, async () => {
        await User.find({ id: '_test' });
      });

      const spans = getTestSpans();
      expect(spans.length).toBe(0);
    });

    it('should not start span on aggregate', async () => {
      await context.with(ROOT_CONTEXT, async () => {
        await User.aggregate([
          { $match: { firstName: 'John' } },
          { $group: { _id: 'John', total: { $sum: '$amount' } } },
        ]);
      });

      const spans = getTestSpans();
      expect(spans.length).toBe(0);
    });
  });
});
