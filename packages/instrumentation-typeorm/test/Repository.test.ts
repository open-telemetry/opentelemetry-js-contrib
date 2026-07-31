/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert';
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
import { ATTR_DB_COLLECTION_NAME } from '../src/semconv';

describe('Repository', () => {
  beforeEach(() => {
    instrumentation.enable();
  });

  afterEach(() => {
    instrumentation.disable();
  });

  it('findAndCount', async () => {
    const ds = new typeorm.DataSource(defaultOptions);
    await ds.initialize();
    const repo = ds.getRepository(User);
    const [_users, count] = await repo.findAndCount();
    assert(count === 0);
    const spans = getTestSpans();
    assert.strictEqual(spans.length, 1);
    const span = spans[0];
    const attributes = span.attributes;
    assert.strictEqual(span.name, 'findAndCount user');
    assert.strictEqual(attributes[ATTR_DB_COLLECTION_NAME], 'user');
    await ds.destroy();
  });
});
