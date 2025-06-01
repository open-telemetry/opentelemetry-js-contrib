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
import { defaultOptions } from './utils';

describe('Connection', () => {
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
    it('raw query', async () => {
      const options = { ...defaultOptions, name: 'rawQuery' };
      const ds = new typeorm.DataSource(options);
      await ds.initialize();
      const query = 'select * from user';
      await ds.query(query);
      const typeOrmSpans = getTestSpans();

      assert.strictEqual(typeOrmSpans.length, 1);
      assert.strictEqual(typeOrmSpans[0].name, 'raw query');
      assert.strictEqual(typeOrmSpans[0].status.code, SpanStatusCode.UNSET);
      const attributes = typeOrmSpans[0].attributes;
      assert.strictEqual(attributes[ATTR_DB_SYSTEM_NAME], options.type);
      assert.strictEqual(attributes[ATTR_DB_NAMESPACE], options.database);
      assert.strictEqual(attributes[ATTR_DB_OPERATION_NAME], 'raw query');
      assert.strictEqual(attributes[ATTR_DB_QUERY_TEXT], query);
      await ds.destroy();
    });
  });
});
