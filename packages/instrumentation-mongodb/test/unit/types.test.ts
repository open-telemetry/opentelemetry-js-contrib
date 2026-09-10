/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { MongodbCommandType } from '../../src';
import { MongodbCommandType as InternalMongodbCommandType } from '../../src/internal-types';

describe('MongodbCommandType', () => {
  it('publicly exports every member the instrumentation can produce', () => {
    // instrumentation.ts's _getCommandType() assigns MongodbCommandType.AGGREGATE
    // for aggregate commands, so it must be reachable from the public API.
    assert.strictEqual(MongodbCommandType.AGGREGATE, 'aggregate');
  });

  it('is the same enum used internally, so the two cannot drift apart again', () => {
    assert.strictEqual(MongodbCommandType, InternalMongodbCommandType);
  });
});
