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
import Instrumentation, { CreateHook, ErrorHook } from '../src';
import * as sinon from 'sinon';
import type * as FSType from 'fs';
import type { FsInstrumentationConfig } from '../src/types';

const createHook = sinon.spy<CreateHook>((functionName, { args }) => {
  // `ts-node`, which we use via `ts-mocha` also patches module loading and creates
  // a lot of unrelated spans. Filter those out.
  const filename = args[0];
  if (!/test\/fixtures/.test(filename as string)) {
    return false;
  }
  return true;
});

let error: Error;
const errorHook = sinon.spy<ErrorHook>((functionName, e) => {
  error = e;
  if (functionName.includes('access') && e.code === 'ENOENT') {
    return false;
  }
  return true;
});

const pluginConfig = {
  createHook,
  errorHook,
};

const provider = new BasicTracerProvider();
const memoryExporter = new InMemorySpanExporter();
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

const assertFilteredOut = () => {
  assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
  const span = memoryExporter.getFinishedSpans()[0];
  assert.strictEqual(span.events.length, 0);
};

const assertKept = () => {
  assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
  const span = memoryExporter.getFinishedSpans()[0];
  assert.strictEqual(span.events.length, 1);
  const event = span.events[0];
  assert.strictEqual(event.name, 'exception');
  assert.strictEqual(
    (event.attributes || {})['exception.message'],
    error.message
  );
};

describe('fs instrumentation: error hook', () => {
  let plugin: Instrumentation;
  let fs: typeof FSType;

  beforeEach(async () => {
    plugin = new Instrumentation(pluginConfig);
    plugin.setTracerProvider(provider);
    plugin.setConfig(pluginConfig as FsInstrumentationConfig);
    plugin.enable();
    fs = require('fs');
    createHook.resetHistory();
    errorHook.resetHistory();
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    plugin.disable();
    memoryExporter.reset();
  });

  describe('Syncronous API', () => {
    it('should filter out errors according to hook', () => {
      try {
        fs.accessSync('./test/fixtures/readtest-404', fs.constants.R_OK);
      } catch (e) {
        assert.strictEqual(e, error);
      }
      assertFilteredOut();
    });

    it('should keep other error events', () => {
      try {
        fs.unlinkSync('./test/fixtures/readtest-404');
      } catch (e) {
        assert.strictEqual(e, error);
      }
      assertKept();
    });
  });

  describe('Callback API', () => {
    it('should filter out errors according to hook', done => {
      fs.access('./test/fixtures/readtest-404', fs.constants.R_OK, e => {
        try {
          assert.strictEqual(e, error);
          assertFilteredOut();
          done();
        } catch (e) {
          done(e);
        }
      });
    });

    it('should keep other error events', done => {
      fs.unlink('./test/fixtures/readtest-404', e => {
        try {
          assert.strictEqual(e, error);
          assertKept();
          done();
        } catch (e) {
          done(e);
        }
      });
    });
  });

  describe('Promise API', () => {
    it('should filter out errors according to hook', async () => {
      try {
        await fs.promises.access(
          './test/fixtures/readtest-404',
          fs.constants.R_OK
        );
      } catch (e) {
        assert.strictEqual(e, error);
      }
      assertFilteredOut();
    });

    it('should keep other error events', async () => {
      try {
        await fs.promises.unlink('./test/fixtures/readtest-404');
      } catch (e) {
        assert.strictEqual(e, error);
      }
      assertKept();
    });
  });
});
