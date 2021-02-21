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
import { CustomAttributeNames, ExpressInstrumentationSpan } from '../src/types';
import { ExpressInstrumentation, ExpressLayerType } from '../src';

const instrumentation = new ExpressInstrumentation({
  ignoreLayersType: [
    ExpressLayerType.MIDDLEWARE,
    ExpressLayerType.ROUTER,
    ExpressLayerType.REQUEST_HANDLER,
  ],
});
instrumentation.enable();
instrumentation.disable();

import * as express from 'express';
import * as http from 'http';
import { AddressInfo } from 'net';

const httpRequest = {
  get: (options: http.ClientRequestArgs | string) => {
    return new Promise((resolve, reject) => {
      return http.get(options, resp => {
        let data = '';
        resp.on('data', chunk => {
          data += chunk;
        });
        resp.on('end', () => {
          resolve(data);
        });
        resp.on('error', err => {
          reject(err);
        });
      });
    });
  },
};

describe('ExpressInstrumentation', () => {
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

  describe('when route exists', () => {
    let server: http.Server;
    let rootSpan: ExpressInstrumentationSpan;

    beforeEach(async () => {
      rootSpan = tracer.startSpan('rootSpan') as ExpressInstrumentationSpan;
      const app = express();
      app.use((req, res, next) =>
        context.with(setSpan(context.active(), rootSpan), next)
      );
      app.use(express.json());
      app.use((req, res, next) => {
        for (let i = 0; i < 1000; i++) {}
        return next();
      });
      const router = express.Router();
      app.use('/toto', router);
      router.get('/:id', (req, res) => {
        setImmediate(() => {
          res.status(200).end();
        });
      });

      server = http.createServer(app);
      await new Promise<void>(resolve => server.listen(0, resolve));
    });

    afterEach(() => {
      server.close();
    });

    it('should ignore all ExpressLayerType based on config', async () => {
      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(setSpan(context.active(), rootSpan), async () => {
        await httpRequest.get(`http://localhost:${port}/toto/tata`);
        rootSpan.end();
        assert.deepStrictEqual(
          memoryExporter
            .getFinishedSpans()
            .filter(
              span =>
                span.attributes[CustomAttributeNames.EXPRESS_TYPE] ===
                  ExpressLayerType.MIDDLEWARE ||
                span.attributes[CustomAttributeNames.EXPRESS_TYPE] ===
                  ExpressLayerType.ROUTER ||
                span.attributes[CustomAttributeNames.EXPRESS_TYPE] ===
                  ExpressLayerType.REQUEST_HANDLER
            ).length,
          0
        );
      });
    });

    it('root span name should be modified to GET /todo/:id', async () => {
      const port = (server.address() as AddressInfo).port;
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
      await context.with(setSpan(context.active(), rootSpan), async () => {
        await httpRequest.get(`http://localhost:${port}/toto/tata`);
        rootSpan.end();
        assert.strictEqual(rootSpan.name, 'GET /toto/:id');
        const exportedRootSpan = memoryExporter
          .getFinishedSpans()
          .find(span => span.name === 'GET /toto/:id');
        assert.notStrictEqual(exportedRootSpan, undefined);
      });
    });
  });
});
