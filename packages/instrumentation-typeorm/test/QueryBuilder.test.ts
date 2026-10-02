/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  ATTR_DB_NAMESPACE,
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '../src/semconv';
import { TypeormInstrumentation } from '../src';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(
  new TypeormInstrumentation()
);

import * as typeorm from 'typeorm';
import { defaultOptions, User } from './utils';

describe('QueryBuilder', () => {
  beforeEach(() => {
    instrumentation.enable();
  });

  afterEach(() => {
    instrumentation.disable();
  });

  it('getManyAndCount', async () => {
    const ds = new typeorm.DataSource(defaultOptions);
    await ds.initialize();
    const queryBuilder = ds.getRepository(User).createQueryBuilder('user');
    const users = await queryBuilder
      .where('user.id = :userId', { userId: '1' })
      .getManyAndCount();
    assert.strictEqual(users.length, 2);
    const typeOrmSpans = getTestSpans();
    assert.strictEqual(typeOrmSpans.length, 1);
    assert.strictEqual(typeOrmSpans[0].name, 'select user');
    assert.strictEqual(typeOrmSpans[0].status.code, SpanStatusCode.UNSET);
    const attributes = typeOrmSpans[0].attributes;
    assert.strictEqual(attributes[ATTR_DB_SYSTEM_NAME], defaultOptions.type);
    assert.strictEqual(attributes[ATTR_SERVER_ADDRESS], defaultOptions.host);
    assert.strictEqual(attributes[ATTR_SERVER_PORT], defaultOptions.port);
    assert.strictEqual(attributes[ATTR_DB_NAMESPACE], defaultOptions.database);
    assert.strictEqual(attributes[ATTR_DB_COLLECTION_NAME], 'user');
    assert.strictEqual(
      attributes[ATTR_DB_QUERY_TEXT],
      'SELECT "user"."id" AS "user_id", "user"."firstName" AS "user_firstName", "user"."lastName" AS "user_lastName" FROM "user" "user" WHERE "user"."id" = :userId'
    );
    await ds.destroy();
  });
});
