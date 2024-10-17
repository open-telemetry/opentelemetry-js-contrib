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
import { strictEqual, ok } from 'assert';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { DnsInstrumentation } from '../../src';
import { spy, restore, SinonSpy } from 'sinon';
import { lookup } from 'dns';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const tracer = provider.getTracer('default');
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

describe('DnsInstrumentation', () => {
  let instrumentation: DnsInstrumentation;

  before(() => {
    instrumentation = new DnsInstrumentation();
    instrumentation.setTracerProvider(provider);
    require('dns');
    strictEqual(lookup.__wrapped, true);
  });

  beforeEach(() => {
    spy(tracer, 'startSpan');
    spy(context, 'with');
  });

  afterEach(() => {
    restore();
  });

  describe('unpatch()', () => {
    it('should not call tracer methods for creating span', done => {
      instrumentation.disable();
      const hostname = 'localhost';

      lookup(hostname, (err, address, family) => {
        ok(address);
        ok(family);

        const spans = memoryExporter.getFinishedSpans();
        strictEqual(spans.length, 0);

        strictEqual(lookup.__wrapped, undefined);
        strictEqual((context.with as SinonSpy).called, false);
        done();
      });
    });
  });
});
