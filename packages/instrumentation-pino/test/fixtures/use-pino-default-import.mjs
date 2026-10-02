/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Use pino from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-pino-default-import.mjs

import { trace } from '@opentelemetry/api';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { PinoInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-pino',
  instrumentations: [new PinoInstrumentation()],
});
sdk.start();

import pino from 'pino';
const logger = pino();

const tracer = trace.getTracer();
await tracer.startActiveSpan('manual', async span => {
  logger.info('hi from logger');
  span.end();
});

await sdk.shutdown();
