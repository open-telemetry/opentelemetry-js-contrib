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
import { SpanStatusCode } from '@opentelemetry/api';
import {
  ATTR_DB_COLLECTION_NAME,
  ATTR_DB_SYSTEM_NAME,
  ATTR_DB_NAMESPACE,
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
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
      const ds = new typeorm.DataSource(options);
      await ds.initialize();

      const user = new User(1, 'opentelemetry', 'io');
      await ds.manager.save(user);
      const typeOrmSpans = getTestSpans();

      assert.strictEqual(typeOrmSpans.length, 1);
      assert.strictEqual(typeOrmSpans[0].name, 'save user');
      assert.strictEqual(typeOrmSpans[0].status.code, SpanStatusCode.UNSET);
      const attributes = typeOrmSpans[0].attributes;
      assert.strictEqual(attributes[ATTR_DB_COLLECTION_NAME], 'user');
      assert.strictEqual(attributes[ATTR_DB_SYSTEM_NAME], options.type);
      assert.strictEqual(attributes[ATTR_DB_NAMESPACE], options.database);
      assert.strictEqual(attributes[ATTR_DB_OPERATION_NAME], 'save');
      assert.strictEqual(
        attributes[ATTR_DB_QUERY_TEXT],
        JSON.stringify({ targetOrEntity: user })
      );
      await ds.destroy();
    });

    it('save', async () => {
      const options = defaultOptions;
      const ds = new typeorm.DataSource(options);
      await ds.initialize();
      const manager = ds.manager;
      const user = new User(1, 'opentelemetry', 'io');
      await manager.save(user);
      const typeOrmSpans = getTestSpans();

      assert.strictEqual(typeOrmSpans.length, 1);
      assert.strictEqual(typeOrmSpans[0].name, 'save user');
      assert.strictEqual(typeOrmSpans[0].status.code, SpanStatusCode.UNSET);
      const attributes = typeOrmSpans[0].attributes;
      assert.strictEqual(attributes[ATTR_DB_COLLECTION_NAME], 'user');
      assert.strictEqual(attributes[ATTR_DB_SYSTEM_NAME], options.type);
      assert.strictEqual(attributes[ATTR_DB_NAMESPACE], options.database);
      assert.strictEqual(attributes[ATTR_DB_OPERATION_NAME], 'save');
      assert.strictEqual(
        attributes[ATTR_DB_QUERY_TEXT],
        JSON.stringify({ targetOrEntity: user })
      );
      await ds.destroy();
    });

    it('remove', async () => {
      const options = defaultOptions;
      const ds = new typeorm.DataSource(options);
      await ds.initialize();
      const manager = ds.manager;

      const user = new User(56, 'opentelemetry', 'io');
      await manager.save(user);
      await manager.remove(user);
      const typeOrmSpans = getTestSpans();

      assert.strictEqual(typeOrmSpans.length, 2);
      assert.strictEqual(typeOrmSpans[1].name, 'remove user');
      assert.strictEqual(typeOrmSpans[1].status.code, SpanStatusCode.UNSET);
      const attributes = typeOrmSpans[1].attributes;
      assert.strictEqual(attributes[ATTR_DB_COLLECTION_NAME], 'user');
      assert.strictEqual(attributes[ATTR_DB_SYSTEM_NAME], options.type);
      assert.strictEqual(attributes[ATTR_DB_NAMESPACE], options.database);
      assert.strictEqual(attributes[ATTR_DB_OPERATION_NAME], 'remove');
      assert.strictEqual(
        attributes[ATTR_DB_QUERY_TEXT],
        JSON.stringify({
          targetOrEntity: {
            id: 56,
            firstName: 'opentelemetry',
            lastName: 'io',
          },
        })
      );
      await ds.destroy();
    });

    it('update', async () => {
      const options = defaultOptions;
      const ds = new typeorm.DataSource(options);
      await ds.initialize();
      const manager = ds.manager;
      const user = new User(56, 'opentelemetry', 'io');
      await manager.save(user);
      const partialEntity = { lastName: '.io' };
      await manager.update(User, 56, partialEntity);
      const typeOrmSpans = getTestSpans();

      assert.strictEqual(typeOrmSpans.length, 2);
      assert.strictEqual(typeOrmSpans[1].name, 'update user');
      assert.strictEqual(typeOrmSpans[1].status.code, SpanStatusCode.UNSET);
      const attributes = typeOrmSpans[1].attributes;
      assert.strictEqual(attributes[ATTR_DB_COLLECTION_NAME], 'user');
      assert.strictEqual(attributes[ATTR_DB_SYSTEM_NAME], options.type);
      assert.strictEqual(attributes[ATTR_DB_NAMESPACE], options.database);
      assert.strictEqual(attributes[ATTR_DB_OPERATION_NAME], 'update');
      assert.strictEqual(
        attributes[ATTR_DB_QUERY_TEXT],
        JSON.stringify({ target: 'User', criteria: 56, partialEntity })
      );
      await ds.destroy();
    });

    it('Sets failure status when function throws', async () => {
      const ds = new typeorm.DataSource(defaultOptions);
      await ds.initialize();
      const manager = ds.manager;
      try {
        await manager.find({} as any);
      } catch (err) {}

      const typeOrmSpans = getTestSpans();
      assert.strictEqual(typeOrmSpans.length, 1);
      assert.strictEqual(typeOrmSpans[0].name, 'find');
      assert.strictEqual(typeOrmSpans[0].status.code, SpanStatusCode.ERROR);
      assert.strictEqual(
        typeOrmSpans[0].status.message,
        'No metadata for "[object Object]" was found.'
      );
      await ds.destroy();
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
      const ds1 = new typeorm.DataSource(defaultOptions);
      await ds1.initialize();
      const ds2 = new typeorm.DataSource(options2);
      await ds2.initialize();

      const manager1 = ds1.manager;
      const manager2 = ds2.manager;

      const user = new User(1, 'opentelemetry', 'io');
      await manager1.save(user);
      await manager2.remove(user);

      const spans = getTestSpans();
      assert.strictEqual(spans.length, 2);
      const sqlite1Span = spans[0];
      const sqlite2Span = spans[1];

      assert.strictEqual(sqlite1Span.name, 'save user');
      assert.strictEqual(
        sqlite1Span.attributes[ATTR_DB_SYSTEM_NAME],
        defaultOptions.type
      );
      assert.strictEqual(
        sqlite1Span.attributes[ATTR_DB_NAMESPACE],
        defaultOptions.database
      );
      assert.strictEqual(
        sqlite1Span.attributes[ATTR_DB_OPERATION_NAME],
        'save'
      );
      assert.strictEqual(
        sqlite1Span.attributes[ATTR_DB_COLLECTION_NAME],
        'user'
      );

      assert.strictEqual(sqlite2Span.name, 'remove user');
      assert.strictEqual(
        sqlite2Span.attributes[ATTR_DB_SYSTEM_NAME],
        options2.type
      );
      assert.strictEqual(
        sqlite2Span.attributes[ATTR_DB_NAMESPACE],
        options2.database
      );
      assert.strictEqual(
        sqlite2Span.attributes[ATTR_DB_OPERATION_NAME],
        'remove'
      );
      assert.strictEqual(
        sqlite2Span.attributes[ATTR_DB_COLLECTION_NAME],
        'user'
      );
      await ds1.destroy();
      await ds2.destroy();
    });
  });
});
