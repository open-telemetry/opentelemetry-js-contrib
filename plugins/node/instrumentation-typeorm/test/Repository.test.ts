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
import { TypeormInstrumentation } from '../src';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(
  new TypeormInstrumentation()
);
import { defaultOptions, User } from './utils';
import * as typeorm from 'typeorm';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

describe('Repository', () => {
  beforeEach(() => {
    instrumentation.enable();
  });

  afterEach(() => {
    instrumentation.disable();
  });

  it('findAndCount', async () => {
    const connection = await typeorm.createConnection(defaultOptions);
    const repo = connection.getRepository(User);
    const user = new User(1, 'aspecto', 'io');
    await repo.insert(user);
    const [_users, count] = await repo.findAndCount();
    expect(count).toBeGreaterThan(0);
    const spans = getTestSpans();
    expect(spans.length).toEqual(2);
    const span = spans[0];
    const attributes = span.attributes;
    expect(attributes[SemanticAttributes.DB_SQL_TABLE]).toBe('user');
    await connection.close();
  });
});
