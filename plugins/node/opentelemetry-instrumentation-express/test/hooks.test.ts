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

import { context, setSpan } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import * as assert from 'assert';
import { CustomAttributeNames } from '../src/types';
import { ExpressInstrumentation, ExpressLayerType } from '../src';

const instrumentation = new ExpressInstrumentation({
  spanNameHook: (req, type, route) => {
    console.log('HOOK', type, route);
    if (route === '*') {
      return `${type} - ${req.method} - ${req.url}`;
    }

    return 'anything';
  },
});
instrumentation.enable();
instrumentation.disable();

import { createServer, httpRequest } from './utils';
import * as express from 'express';

describe('ExpressInstrumentation hooks', () => {
  const provider = new NodeTracerProvider();
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  provider.addSpanProcessor(spanProcessor);
  const tracer = provider.getTracer('default');
  const contextManager = new AsyncHooksContextManager().enable();

  before(() => {
    instrumentation.setTracerProvider(provider);
    context.setGlobalContextManager(contextManager);
    instrumentation.enable();
  });

  afterEach(() => {
    contextManager.disable();
    contextManager.enable();
    memoryExporter.reset();
  });

  describe('span name hooks', () => {
    it('should rename parent span', async () => {
      const rootSpan = tracer.startSpan('rootSpan');
      const app = express();
      app.use((req, res, next) =>
        context.with(setSpan(context.active(), rootSpan), next)
      );
      app.get('*',  (req, res) => {
        console.log('REQ HANDLER');
        res.send("ok");
      });
      const { server, port } = await createServer(app);

      await context.with(setSpan(context.active(), rootSpan), async () => {
        console.log('context active', context.active());
        await httpRequest.get(`http://localhost:${port}/foobar`);
        rootSpan.end();
        const exportedRootSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'rootSpan');
        //assert.notStrictEqual(exportedRootSpan, undefined);
        console.log(exportedRootSpan);
      });
      server.close();
    });
  });
});
