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
import { rawQueryOptions } from './utils';

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
      const options = rawQueryOptions;
      const connection = await typeorm.createConnection(rawQueryOptions);
      const query = 'select * from user';
      await connection.query(query);
      const typeOrmSpans = getTestSpans();

      expect(typeOrmSpans.length).toBe(1);
      expect(typeOrmSpans[0].status.code).toBe(SpanStatusCode.UNSET);
      const attributes = typeOrmSpans[0].attributes;
      expect(attributes[SemanticAttributes.DB_SYSTEM]).toBe(options.type);
      expect(attributes[SemanticAttributes.DB_NAME]).toBe(options.database);
      expect(attributes[SemanticAttributes.DB_OPERATION]).toBe('SELECT');
      expect(attributes[SemanticAttributes.DB_STATEMENT]).toBe(query);
      await connection.close();
    });
  });
});
