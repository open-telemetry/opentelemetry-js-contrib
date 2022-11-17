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
import * as expect from 'expect';
import { SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
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
    expect(users.length).toBe(2);
    const typeOrmSpans = getTestSpans();
    expect(typeOrmSpans.length).toBe(1);
    expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.UNSET);
    const attributes = typeOrmSpans[0].attributes;
    expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(
      connectionOptions.type
    );
    expect(attributes[SemanticAttributes.DB_USER]).toBe(
      connectionOptions.username
    );
    expect(attributes[SemanticAttributes.NET_PEER_NAME]).toBe(
      connectionOptions.host
    );
    expect(attributes[SemanticAttributes.NET_PEER_PORT]).toBe(
      connectionOptions.port
    );
    expect(attributes[SemanticAttributes.DB_NAME]).toBe(
      connectionOptions.database
    );
    expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
    expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(
      'SELECT "user"."id" AS "user_id", "user"."firstName" AS "user_firstName", "user"."lastName" AS "user_lastName" FROM "user" "user" WHERE "user"."id" = :userId'
    );
    await connection.close();
  });
});
