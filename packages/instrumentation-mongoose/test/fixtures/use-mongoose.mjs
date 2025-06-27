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

// Use mongoose from an ES module:
//    node --experimental-loader=@opentelemetry/instrumentation/hook.mjs use-mongoose.mjs [MONGO_URL] [DB_NAME

import { trace } from '@opentelemetry/api';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { MongooseInstrumentation } from '../../build/src/index.js';

const sdk = createTestNodeSdk({
  serviceName: 'use-mongoose',
  instrumentations: [new MongooseInstrumentation()],
});
sdk.start();

import assert from 'assert';
import mongoose from 'mongoose';

const MONGO_URL = process.argv[2] || '';
const DB_NAME = process.argv[3] || '';

const randomId = ((Math.random() * 2 ** 32) >>> 0).toString(16);

await mongoose.connect(MONGO_URL, {
  dbName: DB_NAME,
});

const TestModel = mongoose.model(
  'Test',
  new mongoose.Schema({
    name: String,
  })
);

const tracer = trace.getTracer('mongoose-instrumentation');
await tracer.startActiveSpan('manual', async span => {
  const name = `test-${randomId}`;
  const [createdDoc] = await TestModel.create([{ name }]);

  const doc = await TestModel.findOne({ name }).exec();

  assert(doc && createdDoc?._id.toString() === doc?._id.toString());

  span.end();
});

await mongoose.disconnect();
await sdk.shutdown();
