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

// Use dataloader from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-dataloader-default-import.mjs

import { trace } from '@opentelemetry/api';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';
import * as crypto from 'crypto';

import { DataloaderInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-dataloader',
  instrumentations: [new DataloaderInstrumentation()],
});
sdk.start();

import Dataloader from 'dataloader';

function getMd5HashFromIdx(idx) {
  return crypto.createHash('md5').update(String(idx)).digest('hex');
}
const dataloader = new Dataloader(
  async keys =>
    keys.map((_, idx) => {
      return getMd5HashFromIdx(idx);
    }),
  { cache: true }
);

const tracer = trace.getTracer();
await tracer.startActiveSpan('manual', async span => {
  await dataloader.load(1);
  span.end();
});

await sdk.shutdown();
