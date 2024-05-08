/*
 * Copyright The OpenTelemetry Authors, Aspecto
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
import {
  SEMATTRS_NET_PEER_PORT,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_DB_SQL_TABLE,
  SEMATTRS_DB_NAME,
  SEMATTRS_DB_USER,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_OPERATION,
} from '@opentelemetry/semantic-conventions';
import {
  ExtendedDatabaseAttribute,
  TypeormInstrumentation,
  TypeormInstrumentationConfig,
} from '../src';

import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(
  new TypeormInstrumentation()
);

import * as typeorm from 'typeorm';
import { defaultOptions, User } from './utils';
import { SpanStatusCode } from '@opentelemetry/api';

describe('TypeormInstrumentationConfig', () => {
  it('responseHook', async function () {
    this.timeout(3_000);
    instrumentation.disable();
    const config: TypeormInstrumentationConfig = {
      responseHook: (span, { response }) => {
        span.setAttribute('test', JSON.stringify(response));
      },
    };
    instrumentation.setConfig(config);
    instrumentation.enable();

    const connection = await typeorm.createConnection(defaultOptions);
    const user = new User(1, 'aspecto', 'io');
    await connection.manager.save(user);
    const typeOrmSpans = getTestSpans();
    assert.strictEqual(typeOrmSpans.length, 1);
    const attributes = typeOrmSpans[0].attributes;

    assert.strictEqual(attributes['test'], JSON.stringify(user));
    assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'save');
    assert.strictEqual(attributes[SEMATTRS_DB_SYSTEM], defaultOptions.type);
    await connection.close();
  });

  it('enableInternalInstrumentation:true', async () => {
    const config: TypeormInstrumentationConfig = {
      enableInternalInstrumentation: true,
    };
    instrumentation.setConfig(config);
    const connection = await typeorm.createConnection(defaultOptions);
    await connection.manager.findAndCount(User);
    const spans = getTestSpans();
    assert.strictEqual(spans.length, 2);

    const findAndCountSpan = spans.find(
      s => s.name.indexOf('findAndCount') !== -1
    );
    assert.notStrictEqual(findAndCountSpan, undefined);
    assert.strictEqual(
      findAndCountSpan?.attributes[SEMATTRS_DB_OPERATION],
      'findAndCount'
    );
    assert.strictEqual(
      findAndCountSpan?.attributes[SEMATTRS_DB_SQL_TABLE],
      'user'
    );

    const selectSpan = spans.find(s => s.name.indexOf('select') !== -1);
    assert.notStrictEqual(selectSpan, undefined);
    assert.strictEqual(selectSpan?.attributes[SEMATTRS_DB_OPERATION], 'select');
    assert.strictEqual(selectSpan?.attributes[SEMATTRS_DB_SQL_TABLE], 'user');
    await connection.close();
  });

  it('enableInternalInstrumentation:false', async () => {
    const config: TypeormInstrumentationConfig = {
      enableInternalInstrumentation: false,
    };
    instrumentation.setConfig(config);
    const connection = await typeorm.createConnection(defaultOptions);
    await connection.manager.findAndCount(User);
    const spans = getTestSpans();
    assert.strictEqual(spans.length, 1);
    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'findAndCount');
    assert.strictEqual(attributes[SEMATTRS_DB_SYSTEM], defaultOptions.type);
    assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'user');
    await connection.close();
  });

  it('collectParameters:true', async () => {
    const config: TypeormInstrumentationConfig = {
      collectParameters: true,
    };
    instrumentation.setConfig(config);
    const connectionOptions = defaultOptions as any;
    const connection = await typeorm.createConnection(connectionOptions);
    await connection
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.id = :userId', { userId: '1' })
      .andWhere('user.firstName = :firstName', { firstName: 'bob' })
      .andWhere('user.lastName = :lastName', { lastName: 'dow' })
      .getMany();
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
      'SELECT "user"."id" AS "user_id", "user"."firstName" AS "user_firstName", "user"."lastName" AS "user_lastName" FROM "user" "user" WHERE "user"."id" = :userId AND "user"."firstName" = :firstName AND "user"."lastName" = :lastName'
    );
    assert.strictEqual(
      attributes[ExtendedDatabaseAttribute.DB_STATEMENT_PARAMETERS],
      JSON.stringify({ userId: '1', firstName: 'bob', lastName: 'dow' })
    );
    await connection.close();
  });
});
