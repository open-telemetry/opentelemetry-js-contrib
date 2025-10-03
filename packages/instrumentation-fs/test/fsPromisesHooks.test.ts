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
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { FsInstrumentation } from '../src';
import * as sinon from 'sinon';
import type * as FSPromisesType from 'fs/promises';
import type { FsInstrumentationConfig } from '../src/types';

const createHookError = new Error('createHook failed');
const createHook = sinon.spy((_functionName: string) => {
  throw createHookError;
});
const endHookError = new Error('endHook failed');
const endHook = sinon.spy((_functionName: string) => {
  throw endHookError;
});
const pluginConfig = {
  createHook,
  endHook,
};

const memoryExporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
});

const assertNotHookError = (err?: Error | null) => {
  assert.ok(
    err &&
      err.message !== createHookError.message &&
      err.message !== endHookError.message,
    'Hook error shadowed the error from the original call'
  );
};

const assertSuccessfulCallHooks = (expectedFunctionName: string) => {
  const createHookCall = createHook.withArgs(expectedFunctionName);
  sinon.assert.called(createHookCall);
  sinon.assert.threw(createHookCall, createHookError);

  const endHookCall = endHook.withArgs(expectedFunctionName);
  sinon.assert.called(endHookCall);
  sinon.assert.threw(endHookCall, endHookError);
  assert(
    !(endHookCall.getCall(0).args as any)[1].error,
    'Did not expect an error'
  );
};

const assertFailingCallHooks = (expectedFunctionName: string) => {
  const createHookCall = createHook.withArgs(expectedFunctionName);
  sinon.assert.called(createHookCall);
  sinon.assert.threw(createHookCall, createHookError);

  const endHookCall = endHook.withArgs(expectedFunctionName);
  sinon.assert.called(endHookCall);
  sinon.assert.threw(endHookCall, endHookError);
  assert((endHookCall.getCall(0).args as any)[1].error, 'Expected an error');
};

// This should equal `fs.constants.R_OK`.
// We are hard-coding this because Node 14 and below does not include `constants` in `fsPromises`.
const fsConstantsR_OK = 4;

describe('fs/promises instrumentation: hooks', () => {
  let plugin: FsInstrumentation;
  let fsPromises: typeof FSPromisesType;

  beforeEach(async () => {
    plugin = new FsInstrumentation(pluginConfig);
    plugin.setTracerProvider(provider);
    plugin.setConfig(pluginConfig as FsInstrumentationConfig);
    plugin.enable();
    fsPromises = require('fs/promises');
    createHook.resetHistory();
    endHook.resetHistory();
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    plugin.disable();
    memoryExporter.reset();
  });

  it('should not fail the original successful call when hooks throw', async () => {
    await fsPromises.access('./test/fixtures/readtest', fsConstantsR_OK);

    assertSuccessfulCallHooks('access');
  });

  it('should not shadow the error from original call when hooks throw', async () => {
    await fsPromises
      .access('./test/fixtures/readtest-404', fsConstantsR_OK)
      .catch(assertNotHookError);

    assertFailingCallHooks('access');
  });
});
