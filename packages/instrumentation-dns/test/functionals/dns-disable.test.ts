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

import { context } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { DnsInstrumentation } from '../../src';
import * as Sinon from 'sinon';
import * as dns from 'dns';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
});
const tracer = provider.getTracer('default');

describe('DnsInstrumentation', () => {
  let instrumentation: DnsInstrumentation;

  before(() => {
    instrumentation = new DnsInstrumentation();
    instrumentation.setTracerProvider(provider);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dns');
    assert.strictEqual(dns.lookup.__wrapped, true);
  });

  beforeEach(() => {
    Sinon.spy(tracer, 'startSpan');
    Sinon.spy(context, 'with');
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe('unpatch()', () => {
    it('should not call tracer methods for creating span', done => {
      instrumentation.disable();
      const hostname = 'localhost';

      dns.lookup(hostname, (err, address, family) => {
        assert.ok(address);
        assert.ok(family);

        const spans = memoryExporter.getFinishedSpans();
        assert.strictEqual(spans.length, 0);

        assert.strictEqual(dns.lookup.__wrapped, undefined);
        assert.strictEqual((context.with as sinon.SinonSpy).called, false);
        done();
      });
    });
  });
});
