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

// Use pino from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-pino.mjs

import { trace } from '@opentelemetry/api';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { PinoInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-pino',
  instrumentations: [
    new PinoInstrumentation()
  ]
})
sdk.start();

// Test that both `import pino from 'pino'` and named import work.
// Using a named export requires pino >=6.
import pino, { pino as pinoNamedImport } from 'pino';
const logger = pino();
const loggerNamedImport = pinoNamedImport();

const tracer = trace.getTracer();
await tracer.startActiveSpan('manual', async (span) => {
  logger.info('hi from logger')
  loggerNamedImport.info('hi from loggerNamedImport')
  span.end();
});

await sdk.shutdown();
