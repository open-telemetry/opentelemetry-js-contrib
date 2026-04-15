/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use postgres from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-pg.mjs

import { trace } from '@opentelemetry/api';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';
import assert from 'assert';

import { PgInstrumentation } from '../../build/src/index.js';

const CONFIG = {
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'otel_pg_database',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT
    ? parseInt(process.env.POSTGRES_PORT, 10)
    : 54320,
};

const sdk = createTestNodeSdk({
  serviceName: 'use-pg',
  instrumentations: [new PgInstrumentation()],
});
sdk.start();

import pg from 'pg';
const client = new pg.Client(CONFIG);

await client.connect();

const tracer = trace.getTracer();

await tracer.startActiveSpan('test-span', async span => {
  const res = await client.query('SELECT NOW()');

  assert.ok(res);
  span.end();

  await client.end();
  await sdk.shutdown();
});
