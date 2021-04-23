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
} from '@opentelemetry/tracing';
import { NodeTracerProvider } from '@opentelemetry/node';
import * as tls from 'tls';
import * as assert from 'assert';
import { TLSInstrumentation } from '../src/tls';
import { TLSSocketEvent } from '../src/types';
import { assertTLSSpan, HOST, PORT, SERVER_CERT, SERVER_KEY } from './utils';
// import { TLSSocket } from 'tls';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

function getSpan() {
  const spans = memoryExporter.getFinishedSpans();
  assert.strictEqual(spans.length, 1);
  const [span] = spans;
  return span;
}

describe('TLSInstrumentation', () => {
  let instrumentation: TLSInstrumentation;
  let socket: tls.TLSSocket;
  let server: tls.Server;

  before(() => {
    instrumentation = new TLSInstrumentation();
    instrumentation.setTracerProvider(provider);
    require('tls');
  });

  before(done => {
    server = tls.createServer({
      cert: SERVER_CERT,
      key: SERVER_KEY,
    });

    server.listen(PORT, done);
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  after(() => {
    instrumentation.disable();
    server.close();
  });

  describe('successful tls.connect produces a span', () => {
    it('should produce a span given port and host', done => {
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
          assertTLSSpan(getSpan(), socket);
          done();
        }
      );
    });

    it('should produce a span given options', done => {
      tls.connect(
        {
          port: PORT,
          host: HOST,
          ca: [SERVER_CERT],
          checkServerIdentity: () => {
            return undefined;
          },
        },
        () => {
          assertTLSSpan(getSpan(), socket);
          done();
        }
      );
    });
  });

  describe('invalid input', () => {
    it('should produce an error span when connect throws', done => {
      assert.throws(() => {
        // Invalid cast on purpose to avoid compiler errors.
        tls.connect({ port: {} } as { port: number });
      });

      assert.strictEqual(getSpan().status.code, SpanStatusCode.ERROR);

      done();
    });
  });
});
