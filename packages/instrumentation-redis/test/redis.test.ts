/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RedisInstrumentation } from '../src';
import * as assert from 'assert';

describe('redis', () => {
  it('Returns module definitions of sub-instrumentations', () => {
    const instrumentation = new RedisInstrumentation();
    const moduleDefinitions = instrumentation.getModuleDefinitions();
    assert.ok(moduleDefinitions.length >= 1);
  });
});
