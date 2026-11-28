/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use oracledb from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-oracledb.mjs

import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { OracleInstrumentation } from '../../dist/index.mjs';

const sdk = createTestNodeSdk({
  serviceName: 'use-oracledb',
  instrumentations: [new OracleInstrumentation()],
});
sdk.start();

import oracledb from 'oracledb';

// No database is needed: the connection attempt fails, but the instrumentation
// still records an `oracledb.getConnection` span for it.
try {
  await oracledb.getConnection({
    user: 'otel',
    password: 'secret',
    connectString: '127.0.0.1:1/unreachable',
  });
} catch {
  // expected
}

await sdk.shutdown();
