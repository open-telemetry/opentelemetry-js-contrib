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

import { SpanStatusCode } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import * as assert from 'assert';
import * as tls from 'tls';
import { NetInstrumentation } from '../src';
import { SocketEvent } from '../src/internal-types';
import {
  assertTLSSpan,
  HOST,
  TLS_SERVER_CERT,
  TLS_SERVER_KEY,
  PORT,
} from './utils';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

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
  let tlsServer: tls.Server;
  let tlsSocket: tls.TLSSocket;

  before(() => {
    instrumentation = new NetInstrumentation();
    instrumentation.setTracerProvider(provider);
    require('net');
  });

  before(done => {
    tlsServer = tls.createServer({
      cert: TLS_SERVER_CERT,
      key: TLS_SERVER_KEY,
      // Make sure tests run on nodejs v8 and v10 the same as on v12+
      maxVersion: 'TLSv1.2',
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
