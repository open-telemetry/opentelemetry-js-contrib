/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
process.env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http/dup,database/dup';

import 'mocha';
import { expect } from 'expect';
import { ATTR_DB_OPERATION } from '../src/semconv';
import { SemconvStability } from '@opentelemetry/instrumentation';
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

// Please run `npm run test-services:start` before
describe('mongoose instrumentation [v7/v8/v9]', () => {
  // For these tests, MongoDB must be running. Add RUN_MONGOOSE_TESTS to run
  // these tests.
  const RUN_MONGOOSE_TESTS = process.env.RUN_MONGOOSE_TESTS;
  let shouldTest = true;

  before(async function () {
    // Check if tests should run
    if (!RUN_MONGOOSE_TESTS) {
      console.log('Skipping mongoose tests. Set RUN_MONGOOSE_TESTS env to run');
      shouldTest = false;
      return;
    }

    // Try to connect to MongoDB
    try {
      await mongoose.connect(MONGO_URI, {
        dbName: DB_NAME,
      });
    } catch (err: any) {
      console.log('Skipping mongoose tests. Connection failed:', err.message);
      shouldTest = false;
    }
  });

  after(async () => {
    if (shouldTest) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async function () {
    // Skipping all tests in beforeEach() is a workaround. Mocha does not work
    // properly when skipping tests in before() on nested describe() calls.
    // https://github.com/mochajs/mocha/issues/2819
    if (!shouldTest) {
      this.skip();
    }
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
    if (shouldTest) {
      await User.collection.drop().catch();
    }
  });

  it('instrumenting findOneAndUpdate operation', async () => {
    await User.findOneAndUpdate(
      { email: 'john.doe@example.com' },
      { isUpdated: true }
    );

    const spans = getTestSpans();
    expect(spans.length).toBe(1);
    assertSpan(
      spans[0] as ReadableSpan,
      SemconvStability.OLD | SemconvStability.STABLE,
      SemconvStability.OLD | SemconvStability.STABLE
    );
    expect(spans[0].attributes[ATTR_DB_OPERATION]).toBe('findOneAndUpdate');
    const statement = getStatement(
      spans[0] as ReadableSpan,
      SemconvStability.OLD | SemconvStability.STABLE
    );
    expect(statement.options).toEqual({});
    expect(statement.condition).toEqual({ email: 'john.doe@example.com' });
    expect(statement.updates).toEqual({ isUpdated: true });
  });
});
