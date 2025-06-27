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
import User, { loadUsers } from './user';
import { assertSpan, getStatement } from './asserts';
import { DB_NAME, MONGO_URI } from './config';

// Please run mongodb in the background: docker run -d -p 27017:27017 -v ~/data:/data/db mongo
describe('mongoose instrumentation [v7/v8]', () => {
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
    await loadUsers();
    instrumentation.enable();
  });

  afterEach(async () => {
    instrumentation.disable();
    await User.collection.drop().catch();
  });

  it('instrumenting findOneAndUpdate operation', async () => {
    await User.findOneAndUpdate(
      { email: 'john.doe@example.com' },
      { isUpdated: true }
    );

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(spans[0] as ReadableSpan);
    expect(spans[0].attributes[SEMATTRS_DB_OPERATION]).toBe('findOneAndUpdate');
    const statement = getStatement(spans[0] as ReadableSpan);
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
    expect(statement.updates).toEqual({ isUpdated: true });
  });
});
