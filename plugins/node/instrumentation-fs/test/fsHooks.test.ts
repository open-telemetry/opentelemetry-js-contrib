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
import Instrumentation from '../src';
import * as sinon from 'sinon';
import type * as FSType from 'fs';
import type { FsInstrumentationConfig } from '../src/types';

const supportsPromises = parseInt(process.versions.node.split('.')[0], 10) > 8;

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

const provider = new BasicTracerProvider();
const memoryExporter = new InMemorySpanExporter();
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

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

describe('fs instrumentation: hooks', () => {
  let plugin: Instrumentation;
  let fs: typeof FSType;

  beforeEach(async () => {
    plugin = new Instrumentation(pluginConfig);
    plugin.setTracerProvider(provider);
    plugin.setConfig(pluginConfig as FsInstrumentationConfig);
    plugin.enable();
    fs = require('fs');
    createHook.resetHistory();
    endHook.resetHistory();
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    plugin.disable();
    memoryExporter.reset();
  });

  describe('Syncronous API', () => {
    it('should not fail the original successful call when hooks throw', () => {
      fs.accessSync('./test/fixtures/readtest', fs.constants.R_OK);

      assertSuccessfulCallHooks('accessSync');
    });

    it('should not shadow the error from original call when hooks throw', () => {
      try {
        fs.accessSync('./test/fixtures/readtest-404', fs.constants.R_OK);
      } catch (e) {
        assertNotHookError(e);
      }

      assertFailingCallHooks('accessSync');
    });
  });

  describe('Callback API', () => {
    it('should not fail the original successful call when hooks throw', done => {
      fs.access('./test/fixtures/readtest', fs.constants.R_OK, () => {
        try {
          assertSuccessfulCallHooks('access');
          done();
        } catch (e) {
          done(e);
        }
      });
    });

    it('should not shadow the error from original call when hooks throw', done => {
      fs.access('./test/fixtures/readtest-404', fs.constants.R_OK, err => {
        // this assertion doesn't realistically make as much sense as in the other cases
        // because we'd have to conciously catch the error and pass it to the cb
        assertNotHookError(err);
        try {
          assertFailingCallHooks('access');
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });

  if (supportsPromises) {
    describe('Promise API', () => {
      it('should not fail the original successful call when hooks throw', async () => {
        // eslint-disable-next-line node/no-unsupported-features/node-builtins
        await fs.promises.access('./test/fixtures/readtest', fs.constants.R_OK);

        assertSuccessfulCallHooks('access');
      });

      it('should not shadow the error from original call when hooks throw', async () => {
        // eslint-disable-next-line node/no-unsupported-features/node-builtins
        await fs.promises
          .access('./test/fixtures/readtest-404', fs.constants.R_OK)
          .catch(assertNotHookError);

        assertFailingCallHooks('access');
      });
    });
  }
});
