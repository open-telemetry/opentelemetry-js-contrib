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
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import { isWrapped } from '@opentelemetry/instrumentation';
import { NetInstrumentation } from '@opentelemetry/instrumentation-net';
import * as assert from 'assert';
import { NodeTracerProvider } from '@opentelemetry/node';
import { TLSInstrumentation } from '../src/tls';
import * as Sinon from 'sinon';
import * as tls from 'tls';
import { HOST, PORT, SERVER_CERT, SERVER_KEY } from './utils';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const tracer = provider.getTracer('default');
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

describe('TLSInstrumentation', () => {
  let instrumentation: TLSInstrumentation;
  let netInstrumentation: NetInstrumentation;
  let server: tls.Server;

  before(() => {
    instrumentation = new TLSInstrumentation();
    netInstrumentation = new NetInstrumentation();
    netInstrumentation.setTracerProvider(provider);
    instrumentation.setTracerProvider(provider);
    require('net');
    require('tls');
    assert.strictEqual(isWrapped(tls.TLSSocket.prototype.connect), true);
  });

  before(done => {
    server = tls.createServer({
      cert: SERVER_CERT,
      key: SERVER_KEY,
    });
    server.listen(PORT, done);
  });

  after(() => {
    server.close();
  });

  beforeEach(() => {
    Sinon.spy(tracer, 'startSpan');
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe('disabling instrumentation', () => {
    it('should not call tracer methods for creating span', done => {
      instrumentation.disable();
      tls.connect(
        PORT,
        HOST,
        {
          ca: [SERVER_CERT],
          checkServerIdentity: () => {
            return undefined;
          },
        },
        () => {
          const spans = memoryExporter.getFinishedSpans();
          assert.strictEqual(spans.length, 0);
          assert.strictEqual(isWrapped(tls.TLSSocket.prototype.connect), false);
          assert.strictEqual(
            (tracer.startSpan as sinon.SinonSpy).called,
            false
          );
          done();
        }
      );
    });
  });
});
