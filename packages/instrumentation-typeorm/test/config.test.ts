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
  ATTR_SERVER_PORT,
  ATTR_SERVER_ADDRESS,
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  ATTR_DB_OPERATION_NAME,
} from '../src/semconv';
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

    const ds = new typeorm.DataSource(defaultOptions);
    await ds.initialize();
    const user = new User(1, 'opentelemetry', 'io');
    await ds.manager.save(user);
    const typeOrmSpans = getTestSpans();
    assert.strictEqual(typeOrmSpans.length, 1);
    const attributes = typeOrmSpans[0].attributes;

    assert.strictEqual(attributes['test'], JSON.stringify(user));
    assert.strictEqual(attributes[ATTR_DB_OPERATION_NAME], 'save');
    assert.strictEqual(attributes[ATTR_DB_SYSTEM_NAME], defaultOptions.type);
    await ds.destroy();
  });

  it('enableInternalInstrumentation:true', async () => {
    const config: TypeormInstrumentationConfig = {
      enableInternalInstrumentation: true,
    };
    instrumentation.setConfig(config);
    const ds = new typeorm.DataSource(defaultOptions);
    await ds.initialize();
    await ds.manager.findAndCount(User);
    const spans = getTestSpans();
    assert.strictEqual(spans.length, 2);

    const findAndCountSpan = spans.find(
      s => s.name.indexOf('findAndCount') !== -1
    );
    assert.notStrictEqual(findAndCountSpan, undefined);
    assert.strictEqual(
      findAndCountSpan?.attributes[ATTR_DB_OPERATION_NAME],
      'findAndCount'
    );
    assert.strictEqual(
      findAndCountSpan?.attributes[ATTR_DB_COLLECTION_NAME],
      'user'
    );

    const selectSpan = spans.find(s => s.name.indexOf('select') !== -1);
    assert.notStrictEqual(selectSpan, undefined);
    assert.strictEqual(
      selectSpan?.attributes[ATTR_DB_OPERATION_NAME],
      'select'
    );
    assert.strictEqual(selectSpan?.attributes[ATTR_DB_COLLECTION_NAME], 'user');
    await ds.destroy();
  });

  it('enableInternalInstrumentation:false', async () => {
    const config: TypeormInstrumentationConfig = {
      enableInternalInstrumentation: false,
    };
    instrumentation.setConfig(config);
    const ds = new typeorm.DataSource(defaultOptions);
    await ds.initialize();
    await ds.manager.findAndCount(User);
    const spans = getTestSpans();
    assert.strictEqual(spans.length, 1);
    const attributes = spans[0].attributes;
    assert.strictEqual(attributes[ATTR_DB_OPERATION_NAME], 'findAndCount');
    assert.strictEqual(attributes[ATTR_DB_SYSTEM_NAME], defaultOptions.type);
    assert.strictEqual(attributes[ATTR_DB_COLLECTION_NAME], 'user');
    await ds.destroy();
  });

  it('enhancedDatabaseReporting:true', async () => {
    const config: TypeormInstrumentationConfig = {
      enhancedDatabaseReporting: true,
    };
    instrumentation.setConfig(config);
    const connectionOptions = defaultOptions;
    const ds = new typeorm.DataSource(connectionOptions);
    await ds.initialize();
    await ds
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
    assert.strictEqual(attributes[ATTR_DB_SYSTEM_NAME], connectionOptions.type);
    assert.strictEqual(attributes[ATTR_SERVER_ADDRESS], connectionOptions.host);
    assert.strictEqual(attributes[ATTR_SERVER_PORT], connectionOptions.port);
    assert.strictEqual(
      attributes[ATTR_DB_NAMESPACE],
      connectionOptions.database
    );
    assert.strictEqual(attributes[ATTR_DB_COLLECTION_NAME], 'user');
    assert.strictEqual(
      attributes[ATTR_DB_QUERY_TEXT],
      'SELECT "user"."id" AS "user_id", "user"."firstName" AS "user_firstName", "user"."lastName" AS "user_lastName" FROM "user" "user" WHERE "user"."id" = :userId AND "user"."firstName" = :firstName AND "user"."lastName" = :lastName'
    );
    assert.strictEqual(
      attributes[ExtendedDatabaseAttribute.DB_STATEMENT_PARAMETERS],
      JSON.stringify({ userId: '1', firstName: 'bob', lastName: 'dow' })
    );
    await ds.destroy();
  });
});
