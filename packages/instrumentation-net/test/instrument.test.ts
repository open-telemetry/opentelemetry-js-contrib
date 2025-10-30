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
} from '@opentelemetry/sdk-trace-base';
import { isWrapped } from '@opentelemetry/instrumentation';
import * as assert from 'assert';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { NetInstrumentation } from '../src';
import * as Sinon from 'sinon';
import * as net from 'net';
import { HOST, PORT } from './utils';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
});
const tracer = provider.getTracer('default');

describe('NetInstrumentation', () => {
  let instrumentation: NetInstrumentation;
  let socket: net.Socket;
  let tcpServer: net.Server;

  before(() => {
    instrumentation = new NetInstrumentation();
    instrumentation.setTracerProvider(provider);
    require('net');
    assert.strictEqual(isWrapped(net.Socket.prototype.connect), true);
  });

  before(done => {
    tcpServer = net.createServer();
    tcpServer.listen(PORT, done);
  });

  after(() => {
    tcpServer.close();
  });

  beforeEach(() => {
    Sinon.spy(tracer, 'startSpan');
  });

  afterEach(() => {
    socket.destroy();
    Sinon.restore();
  });

  describe('disabling instrumentation', () => {
    it('should not call tracer methods for creating span', done => {
      instrumentation.disable();
      socket = net.connect(PORT, HOST, () => {
        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 0);
        assert.strictEqual(isWrapped(net.Socket.prototype.connect), false);
        assert.strictEqual((tracer.startSpan as Sinon.SinonSpy).called, false);
        done();
      });
    });
  });
});
