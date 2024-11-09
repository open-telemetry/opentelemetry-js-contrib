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
import { FsInstrumentation } from '../src';
import * as assert from 'assert';
import type * as FSType from 'fs';
import type { FsInstrumentationConfig } from '../src/types';
import * as api from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

const provider = new BasicTracerProvider();
const memoryExporter = new InMemorySpanExporter();
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

const tracer = provider.getTracer('default');

describe('fs instrumentation: requireParentSpan', () => {
  let plugin: FsInstrumentation;
  let fs: typeof FSType;
  let ambientContext: api.Context;
  let endRootSpan: () => void;
  let expectedAmbientSpanCount: number;

  const initializePlugin = (pluginConfig: FsInstrumentationConfig) => {
    plugin = new FsInstrumentation();
    plugin.setTracerProvider(provider);
    plugin.setConfig(pluginConfig);
    plugin.enable();
    fs = require('fs');
    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  };

  beforeEach(() => {
    const contextManager = new AsyncHooksContextManager();
    api.context.setGlobalContextManager(contextManager.enable());
  });

  afterEach(() => {
    plugin.disable();
    memoryExporter.reset();
  });

  const generateTestsForVariants = ({
    expectFSSpan,
  }: {
    expectFSSpan: boolean;
  }) => {
    const prefix = expectFSSpan ? 'creates' : 'does not create';
    const expectedSpanCount = () =>
      (expectFSSpan ? 1 : 0) + expectedAmbientSpanCount;

    it(`${prefix} a span with the callback API`, async () => {
      await new Promise<void>(resolve => {
        api.context.with(ambientContext, () => {
          fs.access('./test/fixtures/readtest', fs.constants.R_OK, () =>
            resolve()
          );
        });
      }).then(() => endRootSpan());

      assert.deepEqual(
        memoryExporter.getFinishedSpans().length,
        expectedSpanCount()
      );
    });

    it(`${prefix} a span with the synchronous API`, () => {
      api.context.with(ambientContext, () => {
        fs.accessSync('./test/fixtures/readtest', fs.constants.R_OK);
        endRootSpan();
      });

      assert.deepEqual(
        memoryExporter.getFinishedSpans().length,
        expectedSpanCount()
      );
    });

    it(`${prefix} a span with the promises API`, async () => {
      await new Promise<void>(resolve => {
        api.context.with(ambientContext, () => {
          fs.promises
            .access('./test/fixtures/readtest', fs.constants.R_OK)
            .finally(() => resolve(endRootSpan()));
        });
      });

      assert.deepEqual(
        memoryExporter.getFinishedSpans().length,
        expectedSpanCount()
      );
    });
  };

  const withRootSpan = (fn: () => void) => {
    describe('with a root span', () => {
      beforeEach(() => {
        const rootSpan = tracer.startSpan('root span');

        ambientContext = api.trace.setSpan(api.context.active(), rootSpan);
        endRootSpan = () => rootSpan.end();
        expectedAmbientSpanCount = 1;
      });

      fn();
    });
  };

  const withoutRootSpan = (fn: () => void) => {
    describe('without a root span', () => {
      beforeEach(() => {
        ambientContext = api.context.active();
        endRootSpan = () => {};
        expectedAmbientSpanCount = 0;
      });

      fn();
    });
  };

  describe('requireParentSpan enabled', () => {
    beforeEach(() => {
      initializePlugin({ requireParentSpan: true });
    });

    withRootSpan(() => {
      generateTestsForVariants({ expectFSSpan: true });
    });

    withoutRootSpan(() => {
      generateTestsForVariants({ expectFSSpan: false });
    });
  });

  describe('requireParentSpan disabled', () => {
    beforeEach(() => {
      initializePlugin({ requireParentSpan: false });
    });

    withRootSpan(() => {
      generateTestsForVariants({ expectFSSpan: true });
    });

    withoutRootSpan(() => {
      generateTestsForVariants({ expectFSSpan: true });
    });
  });
});
