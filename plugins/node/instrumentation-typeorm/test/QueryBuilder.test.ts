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
import { SpanStatusCode } from '@opentelemetry/api';
import {
  SEMATTRS_DB_NAME,
  SEMATTRS_DB_SQL_TABLE,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_USER,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
} from '@opentelemetry/semantic-conventions';
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
    const connectionOptions = defaultOptions as any;
    const connection = await typeorm.createConnection(connectionOptions);
    const queryBuilder = connection
      .getRepository(User)
      .createQueryBuilder('user');
    const users = await queryBuilder
      .where('user.id = :userId', { userId: '1' })
      .getManyAndCount();
    assert.strictEqual(users.length, 2);
    const typeOrmSpans = getTestSpans();
    assert.strictEqual(typeOrmSpans.length, 1);
    assert.strictEqual(typeOrmSpans[0].status.code, SpanStatusCode.UNSET);
    const attributes = typeOrmSpans[0].attributes;
    assert.strictEqual(attributes[SEMATTRS_DB_SYSTEM], connectionOptions.type);
    assert.strictEqual(
      attributes[SEMATTRS_DB_USER],
      connectionOptions.username
    );
    assert.strictEqual(
      attributes[SEMATTRS_NET_PEER_NAME],
      connectionOptions.host
    );
    assert.strictEqual(
      attributes[SEMATTRS_NET_PEER_PORT],
      connectionOptions.port
    );
    assert.strictEqual(
      attributes[SEMATTRS_DB_NAME],
      connectionOptions.database
    );
    assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'user');
    assert.strictEqual(
      attributes[SEMATTRS_DB_STATEMENT],
      'SELECT "user"."id" AS "user_id", "user"."firstName" AS "user_firstName", "user"."lastName" AS "user_lastName" FROM "user" "user" WHERE "user"."id" = :userId'
    );
    await connection.close();
  });
});
