/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { context, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import * as assert from 'assert';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as tls from 'tls';
import { NetInstrumentation } from '../src';
import { SocketEvent } from '../src/internal-types';
import { HOST, PORT, TLS_SERVER_CERT, TLS_SERVER_KEY } from './utils';

// Dedicated endpoints so this suite never races with the servers started by
// the other test files.
const TLS_PORT = PORT + 1;
const IPC_PATH =
  os.platform() !== 'win32'
    ? path.join(os.tmpdir(), 'otel-js-net-test-require-parent-span-ipc')
    : '\\\\.\\pipe\\otel-js-net-test-require-parent-span-ipc';

const memoryExporter = new InMemorySpanExporter();
const provider = new TracerProvider({
  spanProcessors: [new SimpleSpanProcessor({ exporter: memoryExporter })],
});
const tracer = provider.getTracer('test-require-parent-span');

function assertNoSpans() {
  assert.deepStrictEqual(
    memoryExporter.getFinishedSpans().map(span => span.name),
    []
  );
}

describe('NetInstrumentation requireParentSpan', () => {
  let instrumentation: NetInstrumentation;
  let contextManager: AsyncLocalStorageContextManager;
  let socket: net.Socket | undefined;
  let tlsSocket: tls.TLSSocket | undefined;
  let tcpServer: net.Server;
  let ipcServer: net.Server;
  let tlsServer: tls.Server;

  before(() => {
    instrumentation = new NetInstrumentation();
    instrumentation.setTracerProvider(provider);
    contextManager = new AsyncLocalStorageContextManager().enable();
    context.setGlobalContextManager(contextManager);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('net');
  });

  before(done => {
    tcpServer = net.createServer();
    tcpServer.listen(PORT, done);
  });

  before(done => {
    ipcServer = net.createServer();
    ipcServer.listen(IPC_PATH, done);
  });

  before(done => {
    tlsServer = tls.createServer({
      cert: TLS_SERVER_CERT,
      key: TLS_SERVER_KEY,
      maxVersion: 'TLSv1.2',
    });
    tlsServer.listen(TLS_PORT, done);
  });

  afterEach(() => {
    socket?.destroy();
    socket = undefined;
    tlsSocket?.destroy();
    tlsSocket = undefined;
    memoryExporter.reset();
  });

  after(() => {
    instrumentation.disable();
    contextManager.disable();
    context.disable();
    tcpServer.close();
    ipcServer.close();
    tlsServer.close();
  });

  describe('when requireParentSpan is true', () => {
    beforeEach(() => {
      instrumentation.setConfig({ requireParentSpan: true });
    });

    it('should not create a tcp.connect span without a parent span', done => {
      socket = net.connect(PORT, HOST, () => {
        assertNoSpans();
        done();
      });
    });

    it('should not create an ipc.connect span without a parent span', done => {
      socket = net.connect(IPC_PATH, () => {
        assertNoSpans();
        done();
      });
    });

    it('should not create a generic connect span without a parent span', done => {
      const assertSpans = () => {
        try {
          assertNoSpans();
          done();
        } catch (e) {
          done(e);
        }
      };

      socket = new net.Socket();
      try {
        // `socket.connect()` throws on newer runtimes and only emits 'close'
        // on older ones. Either way no span must be created.
        socket.once(SocketEvent.CLOSE, assertSpans);
        socket.connect(undefined as unknown as string);
      } catch {
        socket.removeListener(SocketEvent.CLOSE, assertSpans);
        assertSpans();
      }
    });

    it('should not create tls.connect or tcp.connect spans without a parent span', done => {
      tlsSocket = tls.connect(
        TLS_PORT,
        HOST,
        {
          ca: [TLS_SERVER_CERT],
          checkServerIdentity: () => undefined,
        },
        () => {
          assertNoSpans();
          done();
        }
      );
    });

    it('should create a tcp.connect span when a parent span is active', done => {
      const parent = tracer.startSpan('parent');
      // Leave the parent context before handing control back to mocha, so the
      // parent span does not leak into the next test through async storage.
      const finish = context.bind(context.active(), done);

      context.with(trace.setSpan(context.active(), parent), () => {
        socket = net.connect(PORT, HOST, () => {
          const spans = memoryExporter.getFinishedSpans();
          assert.deepStrictEqual(
            spans.map(span => span.name),
            ['tcp.connect']
          );
          assert.strictEqual(
            spans[0].parentSpanContext?.spanId,
            parent.spanContext().spanId
          );
          finish();
        });
      });
    });

    it('should create tls.connect and tcp.connect spans when a parent span is active', done => {
      const parent = tracer.startSpan('parent');
      const finish = context.bind(context.active(), done);

      context.with(trace.setSpan(context.active(), parent), () => {
        tlsSocket = tls.connect(
          TLS_PORT,
          HOST,
          {
            ca: [TLS_SERVER_CERT],
            checkServerIdentity: () => undefined,
          },
          () => {
            const spans = memoryExporter.getFinishedSpans();
            assert.deepStrictEqual(
              spans.map(span => span.name),
              ['tcp.connect', 'tls.connect']
            );
            const [tcpSpan, tlsSpan] = spans;
            assert.strictEqual(
              tlsSpan.parentSpanContext?.spanId,
              parent.spanContext().spanId
            );
            assert.strictEqual(
              tcpSpan.parentSpanContext?.spanId,
              tlsSpan.spanContext().spanId
            );
            finish();
          }
        );
      });
    });
  });

  describe('when requireParentSpan is not set', () => {
    beforeEach(() => {
      instrumentation.setConfig({});
    });

    it('should create a tcp.connect span without a parent span', done => {
      socket = net.connect(PORT, HOST, () => {
        const spans = memoryExporter.getFinishedSpans();
        assert.deepStrictEqual(
          spans.map(span => span.name),
          ['tcp.connect']
        );
        assert.strictEqual(spans[0].parentSpanContext, undefined);
        done();
      });
    });
  });
});
