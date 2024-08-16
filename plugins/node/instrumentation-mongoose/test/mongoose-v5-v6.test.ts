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
import { SEMATTRS_DB_OPERATION } from '@opentelemetry/semantic-conventions';
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

// We can't use @ts-expect-error because it will fail depending on the used mongoose version on tests
/* eslint-disable @typescript-eslint/ban-ts-comment */

// Please run mongodb in the background: docker run -d -p 27017:27017 -v ~/data:/data/db mongo
describe('mongoose instrumentation [v5/v6]', () => {
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
      dbStatementSerializer: (_operation: string, payload) => {
        return JSON.stringify(payload, (key, value) => {
          return key === 'session' ? '[Session]' : value;
        });
      },
    });
    instrumentation.enable();
    await loadUsers();
    await User.createIndexes();
  });

  afterEach(async () => {
    instrumentation.disable();
    await User.collection.drop().catch();
  });

  describe('when save call has callback', async () => {
    it('instrumenting save operation with promise and option property set', done => {
      const document = {
        firstName: 'Test first name',
        lastName: 'Test last name',
        email: 'test@example.com',
      };
      const user: IUser = new User(document);
      // @ts-ignore - v7 removed callback support
      // https://mongoosejs.com/docs/migrating_to_7.html#dropped-callback-support
      user.save({ wtimeout: 42 }, async () => {
        const spans = getTestSpans();
        expect(spans.length).toBe(1);
        assertSpan(spans[0] as ReadableSpan);
        expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('save');
        const statement = getStatement(spans[0] as ReadableSpan);
        expect(statement.document).toEqual(expect.objectContaining(document));
        expect(statement.options.wtimeout).toEqual(42);

        const createdUser = await User.findById(user._id).lean();
        // @ts-ignore - v8 made `._id` optional
        // https://mongoosejs.com/docs/migrating_to_8.html#removed-id-setter
        expect(createdUser?._id.toString()).toEqual(user._id.toString());
        done();
      });
    });

    it('instrumenting save operation with generic options and callback', done => {
      const document = {
        firstName: 'Test first name',
        lastName: 'Test last name',
        email: 'test@example.com',
      };
      const user: IUser = new User(document);

      // @ts-ignore - v7 removed callback support
      // https://mongoosejs.com/docs/migrating_to_7.html#dropped-callback-support
      user.save({}, () => {
        const spans = getTestSpans();

        expect(spans.length).toBe(1);
        assertSpan(spans[0] as ReadableSpan);
        expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('save');
        const statement = getStatement(spans[0] as ReadableSpan);
        expect(statement.document).toEqual(expect.objectContaining(document));
        done();
      });
    });

    it('instrumenting save operation with only callback', done => {
      const document = {
        firstName: 'Test first name',
        lastName: 'Test last name',
        email: 'test@example.com',
      };
      const user: IUser = new User(document);

      // @ts-ignore - v7 removed callback support
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
  });

  describe('remove operation', () => {
    it('instrumenting remove operation [deprecated]', async () => {
      const user = await User.findOne({ email: 'john.doe@example.com' });
      // @ts-ignore - v7 removed `remove` method
      // https://mongoosejs.com/docs/migrating_to_7.html#removed-remove
      await user!.remove();

      const spans = getTestSpans();
      expect(spans.length).toBe(2);
      assertSpan(spans[1] as ReadableSpan);
      expect(spans[1].attributes[SEMATTRS_DB_OPERATION]).toBe('remove');
    });

    it('instrumenting remove operation with callbacks [deprecated]', done => {
      User.findOne({ email: 'john.doe@example.com' }).then(user =>
        // @ts-ignore - v7 removed `remove` method
        // https://mongoosejs.com/docs/migrating_to_7.html#removed-remove
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
  });

  it('instrumenting count operation [deprecated]', async () => {
    // @ts-ignore - v8 removed `count` method
    // https://mongoosejs.com/docs/migrating_to_8.html#removed-count
    await User.count({});

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('count');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({});
  });

  it('instrumenting update operation [deprecated]', async () => {
    // @ts-ignore - v7 removed `update` method
    // https://mongoosejs.com/docs/migrating_to_7.html#removed-update
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
    // @ts-ignore - v8 removed `findOneAndRemove` method
    // https://mongoosejs.com/docs/migrating_to_8.html#removed-findoneandremove
    await User.findOneAndRemove({ email: 'john.doe@example.com' });

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('findOneAndRemove');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
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

    it('responseHook works with callback in exec patch', done => {
      // @ts-ignore - v7 removed callback support
      // https://mongoosejs.com/docs/migrating_to_7.html#dropped-callback-support
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

    it('responseHook works with callback in model methods patch', done => {
      const document = {
        firstName: 'Test first name',
        lastName: 'Test last name',
        email: 'test@example.com',
      };
      const user: IUser = new User(document);
      // @ts-ignore - v7 removed callback support
      // https://mongoosejs.com/docs/migrating_to_7.html#dropped-callback-support
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
  });
});

/* eslint-enable @typescript-eslint/ban-ts-comment */
