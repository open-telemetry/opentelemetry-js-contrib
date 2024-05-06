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
  SEMATTRS_DB_SQL_TABLE,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_NAME,
  SEMATTRS_DB_OPERATION,
  SEMATTRS_DB_STATEMENT,
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

describe('EntityManager', () => {
  after(() => {
    instrumentation.enable();
  });
  beforeEach(() => {
    instrumentation.enable();
  });
  afterEach(() => {
    instrumentation.disable();
  });

  describe('single connection', () => {
    it('save using connection.manager', async () => {
      const options = defaultOptions;
      const connection = await typeorm.createConnection(defaultOptions);
      const user = new User(1, 'aspecto', 'io');
      await connection.manager.save(user);
      const typeOrmSpans = getTestSpans();

      assert.strictEqual(typeOrmSpans.length, 1);
      assert.strictEqual(typeOrmSpans[0].status.code, SpanStatusCode.UNSET);
      const attributes = typeOrmSpans[0].attributes;
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'user');
      assert.strictEqual(attributes[SEMATTRS_DB_SYSTEM], options.type);
      assert.strictEqual(attributes[SEMATTRS_DB_NAME], options.database);
      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'save');
      assert.strictEqual(
        attributes[SEMATTRS_DB_STATEMENT],
        JSON.stringify({ targetOrEntity: user })
      );
      await connection.close();
    });

    it('save', async () => {
      const options = defaultOptions;
      const connection = await typeorm.createConnection(defaultOptions);
      const manager = connection.createEntityManager();
      const user = new User(1, 'aspecto', 'io');
      await manager.save(user);
      const typeOrmSpans = getTestSpans();

      assert.strictEqual(typeOrmSpans.length, 1);
      assert.strictEqual(typeOrmSpans[0].status.code, SpanStatusCode.UNSET);
      const attributes = typeOrmSpans[0].attributes;
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'user');
      assert.strictEqual(attributes[SEMATTRS_DB_SYSTEM], options.type);
      assert.strictEqual(attributes[SEMATTRS_DB_NAME], options.database);
      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'save');
      assert.strictEqual(
        attributes[SEMATTRS_DB_STATEMENT],
        JSON.stringify({ targetOrEntity: user })
      );
      await connection.close();
    });

    it('remove', async () => {
      const options = defaultOptions;
      const connection = await typeorm.createConnection(defaultOptions);
      const manager = connection.createEntityManager();

      const user = new User(56, 'aspecto', 'io');
      await manager.save(user);
      await manager.remove(user);
      const typeOrmSpans = getTestSpans();

      assert.strictEqual(typeOrmSpans.length, 2);
      assert.strictEqual(typeOrmSpans[1].status.code, SpanStatusCode.UNSET);
      const attributes = typeOrmSpans[1].attributes;
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'user');
      assert.strictEqual(attributes[SEMATTRS_DB_SYSTEM], options.type);
      assert.strictEqual(attributes[SEMATTRS_DB_NAME], options.database);
      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'remove');
      assert.strictEqual(
        attributes[SEMATTRS_DB_STATEMENT],
        JSON.stringify({
          targetOrEntity: { id: 56, firstName: 'aspecto', lastName: 'io' },
        })
      );
      await connection.close();
    });

    it('update', async () => {
      const options = defaultOptions;
      const connection = await typeorm.createConnection(defaultOptions);
      const manager = connection.createEntityManager();
      const user = new User(56, 'aspecto', 'io');
      await manager.save(user);
      const partialEntity = { lastName: '.io' };
      await manager.update(User, 56, partialEntity);
      const typeOrmSpans = getTestSpans();

      assert.strictEqual(typeOrmSpans.length, 2);
      assert.strictEqual(typeOrmSpans[1].status.code, SpanStatusCode.UNSET);
      const attributes = typeOrmSpans[1].attributes;
      assert.strictEqual(attributes[SEMATTRS_DB_SQL_TABLE], 'user');
      assert.strictEqual(attributes[SEMATTRS_DB_SYSTEM], options.type);
      assert.strictEqual(attributes[SEMATTRS_DB_NAME], options.database);
      assert.strictEqual(attributes[SEMATTRS_DB_OPERATION], 'update');
      assert.strictEqual(
        attributes[SEMATTRS_DB_STATEMENT],
        JSON.stringify({ target: 'User', criteria: 56, partialEntity })
      );
      await connection.close();
    });

    it('Sets failure status when function throws', async () => {
      const connection = await typeorm.createConnection(defaultOptions);
      const manager = connection.createEntityManager();
      try {
        await manager.find({} as any);
      } catch (err) {}

      const typeOrmSpans = getTestSpans();
      assert.strictEqual(typeOrmSpans.length, 1);
      assert.strictEqual(typeOrmSpans[0].status.code, SpanStatusCode.ERROR);
      assert.strictEqual(
        typeOrmSpans[0].status.message,
        'No metadata for "[object Object]" was found.'
      );
      await connection.close();
    });
  });

  describe('multiple connections', () => {
    const options2: any = {
      name: 'connection2',
      type: 'sqlite',
      database: 'connection2.db',
      entities: [User],
      synchronize: true,
    };

    it('appends matching connection details to span', async () => {
      const [sqlite1, sqlite2] = await typeorm.createConnections([
        defaultOptions,
        options2,
      ]);
      const manager1 = sqlite1.createEntityManager();
      const manager2 = sqlite2.createEntityManager();

      const user = new User(1, 'aspecto', 'io');
      await manager1.save(user);
      await manager2.remove(user);

      const spans = getTestSpans();
      assert.strictEqual(spans.length, 2);
      const sqlite1Span = spans[0];
      const sqlite2Span = spans[1];

      assert.strictEqual(
        sqlite1Span.attributes[SEMATTRS_DB_SYSTEM],
        defaultOptions.type
      );
      assert.strictEqual(
        sqlite1Span.attributes[SEMATTRS_DB_NAME],
        defaultOptions.database
      );
      assert.strictEqual(sqlite1Span.attributes[SEMATTRS_DB_OPERATION], 'save');
      assert.strictEqual(sqlite1Span.attributes[SEMATTRS_DB_SQL_TABLE], 'user');

      assert.strictEqual(
        sqlite2Span.attributes[SEMATTRS_DB_SYSTEM],
        options2.type
      );
      assert.strictEqual(
        sqlite2Span.attributes[SEMATTRS_DB_NAME],
        options2.database
      );
      assert.strictEqual(
        sqlite2Span.attributes[SEMATTRS_DB_OPERATION],
        'remove'
      );
      assert.strictEqual(sqlite2Span.attributes[SEMATTRS_DB_SQL_TABLE], 'user');
      await sqlite1.close();
      await sqlite2.close();
    });
  });
});
