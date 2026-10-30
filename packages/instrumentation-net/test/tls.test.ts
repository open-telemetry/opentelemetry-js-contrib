/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanStatusCode, context } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import * as assert from 'assert';
import * as tls from 'tls';
import { NetInstrumentation } from '../src';
import { SocketEvent } from '../src/internal-types';
import {
  ATTR_TLS_CIPHER,
  ATTR_TLS_ESTABLISHED,
  ATTR_TLS_NEXT_PROTOCOL,
  ATTR_TLS_PROTOCOL_NAME,
  ATTR_TLS_PROTOCOL_VERSION,
} from '../src/semconv';
import {
  assertTLSSpan,
  HOST,
  TLS_SERVER_CERT,
  TLS_SERVER_KEY,
  PORT,
} from './utils';

const memoryExporter = new InMemorySpanExporter();
const provider = new TracerProvider({
  spanProcessors: [new SimpleSpanProcessor({ exporter: memoryExporter })],
});

function getTLSSpans() {
  const spans = memoryExporter.getFinishedSpans();
  assert.strictEqual(spans.length, 2);
  const [netSpan, tlsSpan] = spans;
  return {
    netSpan,
    tlsSpan,
  };
}

describe('NetInstrumentation', () => {
  let instrumentation: NetInstrumentation;
  let contextManager: AsyncLocalStorageContextManager;

  let tlsServer: tls.Server;
  let tlsSocket: tls.TLSSocket;

  before(() => {
    instrumentation = new NetInstrumentation();
    instrumentation.setTracerProvider(provider);
    contextManager = new AsyncLocalStorageContextManager().enable();
    context.setGlobalContextManager(contextManager.enable());
    require('net');
  });

  before(done => {
    tlsServer = tls.createServer({
      cert: TLS_SERVER_CERT,
      key: TLS_SERVER_KEY,
      // Make sure tests run on nodejs v8 and v10 the same as on v12+
      maxVersion: 'TLSv1.2',
      ALPNProtocols: ['http/1.1'],
    });
    tlsServer.listen(PORT, done);
  });

  afterEach(() => {
    memoryExporter.reset();
    tlsSocket.destroy();
  });

  after(() => {
    instrumentation.disable();
    tlsServer.close();
  });

  describe('successful tls.connect produces a span', () => {
    it('should produce a span with "onSecure" callback', done => {
      tlsSocket = tls.connect(
        PORT,
        HOST,
        {
          ca: [TLS_SERVER_CERT],
          checkServerIdentity: () => {
            return undefined;
          },
        },
        () => {
          assertTLSSpan(getTLSSpans(), tlsSocket);
          done();
        }
      );
    });

    it('should produce a span without "onSecure" callback', done => {
      tlsSocket = tls.connect(PORT, HOST, {
        ca: [TLS_SERVER_CERT],
        checkServerIdentity: () => {
          return undefined;
        },
      });
      tlsServer.once('secureConnection', c => {
        c.end();
      });
      tlsSocket.once('end', () => {
        assertTLSSpan(getTLSSpans(), tlsSocket);
        done();
      });
    });

    it('should record the negotiated ALPN protocol', done => {
      tlsSocket = tls.connect(
        PORT,
        HOST,
        {
          ca: [TLS_SERVER_CERT],
          ALPNProtocols: ['http/1.1'],
          checkServerIdentity: () => {
            return undefined;
          },
        },
        () => {
          assertTLSSpan(getTLSSpans(), tlsSocket, {
            [ATTR_TLS_NEXT_PROTOCOL]: 'http/1.1',
          });
          done();
        }
      );
    });

    it('should set tls.established even if the certificate is not authorized', done => {
      tlsSocket = tls.connect(
        PORT,
        HOST,
        {
          ca: [],
          rejectUnauthorized: false,
          checkServerIdentity: () => {
            return undefined;
          },
        },
        () => {
          assert.strictEqual(tlsSocket.authorized, false);
          assertTLSSpan(getTLSSpans(), tlsSocket);
          done();
        }
      );
    });

    it('should record TLS 1.3 connections', done => {
      const tls13Server = tls.createServer({
        cert: TLS_SERVER_CERT,
        key: TLS_SERVER_KEY,
        minVersion: 'TLSv1.3',
      });
      tls13Server.listen(0, () => {
        const { port } = tls13Server.address() as { port: number };
        tlsSocket = tls.connect(
          port,
          HOST,
          {
            ca: [TLS_SERVER_CERT],
            checkServerIdentity: () => {
              return undefined;
            },
          },
          () => {
            const { tlsSpan } = getTLSSpans();
            assert.strictEqual(tlsSpan.attributes[ATTR_TLS_ESTABLISHED], true);
            assert.strictEqual(
              tlsSpan.attributes[ATTR_TLS_PROTOCOL_NAME],
              'tls'
            );
            assert.strictEqual(
              tlsSpan.attributes[ATTR_TLS_PROTOCOL_VERSION],
              '1.3'
            );
            assert.match(
              String(tlsSpan.attributes[ATTR_TLS_CIPHER]),
              /^TLS_AES_|^TLS_CHACHA20_/
            );
            tls13Server.close(() => done());
            tlsSocket.destroy();
          }
        );
      });
    });

    it('should produce an error span when certificate is not trusted', done => {
      tlsSocket = tls.connect(
        PORT,
        HOST,
        {
          ca: [],
          checkServerIdentity: () => {
            return undefined;
          },
        },
        () => {
          assertTLSSpan(getTLSSpans(), tlsSocket);
          done();
        }
      );
      tlsSocket.on('error', error => {
        const { tlsSpan } = getTLSSpans();
        assert.strictEqual(tlsSpan.status.message, error.message);
        assert.strictEqual(tlsSpan.status.code, SpanStatusCode.ERROR);
        assert.deepStrictEqual(tlsSpan.attributes, {
          [ATTR_TLS_ESTABLISHED]: false,
        });
        done();
      });
    });
  });

  describe('cleanup', () => {
    function assertNoDanglingListeners(tlsSocket: tls.TLSSocket) {
      const events = new Set(tlsSocket.eventNames());

      for (const event of [
        SocketEvent.CONNECT,
        SocketEvent.SECURE_CONNECT,
        SocketEvent.ERROR,
      ]) {
        assert.equal(events.has(event), false);
      }
      assert.strictEqual(tlsSocket.listenerCount(SocketEvent.CLOSE), 1);
    }

    it('should clean up listeners for tls.connect', done => {
      tlsSocket = tls.connect(
        PORT,
        HOST,
        {
          ca: [TLS_SERVER_CERT],
          checkServerIdentity: () => {
            return undefined;
          },
        },
        () => {
          tlsSocket.destroy();
          tlsSocket.once(SocketEvent.CLOSE, () => {
            assertNoDanglingListeners(tlsSocket);
            done();
          });
        }
      );
    });
  });
});
