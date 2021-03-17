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

import { context, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import { GeneralAttribute } from '@opentelemetry/semantic-conventions';
import * as assert from 'assert';
import { NodeTracerProvider } from '@opentelemetry/node';
import { NetInstrumentation } from '../src/net';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const tracer = provider.getTracer('default');
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

function assertClientSpan(span: ReadableSpan) {
  assert.strictEqual(span.kind, SpanKind.CLIENT);
}

function assertAttrib(span: ReadableSpan, attrib: string, value: any) {
  assert.strictEqual(span.attributes[attrib], value);
}

describe('NetInstrumentation', () => {
  const PORT = 42123;
  const HOST = 'localhost';
  const IPC_PATH = path.join(os.tmpdir(), 'otel-js-net-test-ipc');

  function assertTcpSpan(span: ReadableSpan, socket: net.Socket) {
    assertClientSpan(span);
    assertAttrib(span, GeneralAttribute.NET_TRANSPORT, 'IP.TCP');
    assertAttrib(span, GeneralAttribute.NET_PEER_NAME, HOST);
    assertAttrib(span, GeneralAttribute.NET_PEER_PORT, PORT);
    assertAttrib(span, GeneralAttribute.NET_HOST_IP, socket.localAddress);
    assertAttrib(span, GeneralAttribute.NET_HOST_PORT, socket.localPort);
  }

  function assertIpcSpan(span: ReadableSpan) {
    assertClientSpan(span);
    assertAttrib(span, GeneralAttribute.NET_TRANSPORT, os.platform() == 'win32' ? 'pipe' : 'Unix');
    assertAttrib(span, GeneralAttribute.NET_PEER_NAME, IPC_PATH);
  }

  function getSpan() {
    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 1);
    const [span] = spans;
    return span;
  }

  let instrumentation: NetInstrumentation;
  let socket: net.Socket;
  let tcpServer: net.Server;
  let ipcServer: net.Server;

  before(() => {
    instrumentation = new NetInstrumentation();
    instrumentation.setTracerProvider(provider);
    require('net');
  });

  before((done) => {
    tcpServer = net.createServer();
    tcpServer.listen(PORT, done);
  });

  before((done) => {
    ipcServer = net.createServer();
    ipcServer.listen(IPC_PATH, done);
  });

  beforeEach(() => {
    socket = new net.Socket();
  });

  afterEach(() => {
    socket.destroy();
    memoryExporter.reset();
  });

  after(() => {
    instrumentation.disable();
    tcpServer.close();
    ipcServer.close();
  });

  describe('successful net.connect produces a span', () => {
    it('should produce a span given port and host', done => {
      socket = net.connect(PORT, HOST, () => {
        assertTcpSpan(getSpan(), socket);
        done();
      });
    });

    it('should produce a span for IPC', done => {
      socket = net.connect(IPC_PATH, () => {
        assertIpcSpan(getSpan());
        done();
      });
    });

    it('should produce a span given options', done => {
      socket = net.connect({
        port: PORT,
        host: 'localhost'
      }, () => {
        assertTcpSpan(getSpan(), socket);
        done();
      });
    });
  });

  describe('successful net.createConnection produces a span', () => {
    it('should produce a span given port and host', done => {
      socket = net.createConnection(PORT, HOST, () => {
        assertTcpSpan(getSpan(), socket);
        done();
      });
    });

    it('should produce a span for IPC', done => {
      socket = net.createConnection(IPC_PATH, () => {
        assertIpcSpan(getSpan());
        done();
      });
    });

    it('should produce a span given options', done => {
      socket = net.createConnection({
        port: PORT,
        host: 'localhost'
      }, () => {
        assertTcpSpan(getSpan(), socket);
        done();
      });
    });
  });

  describe('successful Socket.connect produces a span', () => {
    it('should produce a span given port and host', done => {
      socket.connect(PORT, HOST, () => {
        assertTcpSpan(getSpan(), socket);
        done();
      });
    });

    it('should produce a span for IPC', done => {
      socket.connect(IPC_PATH, () => {
        assertIpcSpan(getSpan());
        done();
      });
    });

    it('should produce a span given options', done => {
      socket.connect({
        port: PORT,
        host: 'localhost'
      }, () => {
        assertTcpSpan(getSpan(), socket);
        done();
      });
    });
  });

  describe('invalid input', () => {
    it('should produce an error span when connect throws', done => {

      assert.throws(() => {
        socket.connect({ port: {} });
      });

      done();
      
      assert.strictEqual(getSpan().status.code, SpanStatusCode.ERROR);
    });

    it('should produce a generic span in case transport type can not be determined', done => {
      socket.once('close', () => {
        let span = getSpan();
        assert.strictEqual(span.attributes[GeneralAttribute.NET_TRANSPORT], undefined);
        assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
        done();
      });
      socket.connect();
    });
  });

  describe('cleanup', () => {
    it('should clean up listeners', done => {
      socket.connect(PORT);
      socket.destroy();
      socket.once('close', () => {
        const events = new Set(socket.eventNames());
        for (const event of ['connect', 'timeout', 'error', 'close']) {
          assert.equal(events.has(event), false);
        }
        done();
      });
    });
  });
});
