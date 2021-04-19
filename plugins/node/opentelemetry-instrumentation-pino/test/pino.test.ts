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
import {
  context,
  getSpan,
  setSpan,
  NoopTracerProvider,
  Span,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/node';
import { isWrapped } from '@opentelemetry/instrumentation';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { Writable } from 'stream';
import * as assert from 'assert';
import * as sinon from 'sinon';
import type * as Pino from 'pino';

import { PinoInstrumentation } from '../src/pino';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const tracer = provider.getTracer('default');
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
context.setGlobalContextManager(new AsyncHooksContextManager());

const kMessage = 'log-message';

describe('PinoInstrumentation', () => {
  let stream;
  let writeSpy: sinon.SinonSpy;
  let pino: typeof Pino;
  let instrumentation: PinoInstrumentation;
  let logger: Pino.Logger;

  function assertInjection(span: Span) {
    sinon.assert.calledOnce(writeSpy);
    const { traceId, spanId, traceFlags } = span.context();
    const record = JSON.parse(writeSpy.firstCall.args[0].toString());
    assert.strictEqual(record['trace_id'], traceId);
    assert.strictEqual(record['span_id'], spanId);
    assert.strictEqual(record['trace_flags'], `0${traceFlags.toString(16)}`);
    assert.strictEqual(kMessage, record['msg']);
    return record;
  }

  function testInjection(span: Span) {
    logger.info(kMessage);
    return assertInjection(span);
  }

  function testNoInjection() {
    logger.info(kMessage);
    sinon.assert.calledOnce(writeSpy);
    const record = JSON.parse(writeSpy.firstCall.args[0].toString());
    assert.strictEqual(record['trace_id'], undefined);
    assert.strictEqual(record['span_id'], undefined);
    assert.strictEqual(record['trace_flags'], undefined);
    assert.strictEqual(kMessage, record['msg']);
    return record;
  }

  function init() {
    stream = new Writable();
    stream._write = () => {};
    writeSpy = sinon.spy(stream, 'write');
    logger = pino(stream);
  }

  before(() => {
    instrumentation = new PinoInstrumentation();
    instrumentation.enable();
    pino = require('pino');
  });

  describe('enabled instrumentation', () => {
    beforeEach(() => {
      init();
      assert.ok(isWrapped((logger as any)[pino.symbols.writeSym]));
    });

    it('injects span context to records', () => {
      const span = tracer.startSpan('abc');
      context.with(setSpan(context.active(), span), () => {
        testInjection(span);
      });
    });

    it('injects span context to child logger records', () => {
      const span = tracer.startSpan('abc');
      context.with(setSpan(context.active(), span), () => {
        const child = logger.child({ foo: 42 });
        child.info(kMessage);
        assertInjection(span);
      });
    });

    it('calls the users log hook', () => {
      const span = tracer.startSpan('abc');
      instrumentation.setConfig({
        enabled: true,
        logHook: (_span, record) => {
          record['resource.service.name'] = 'test-service';
        },
      });
      context.with(setSpan(context.active(), span), () => {
        const record = testInjection(span);
        assert.strictEqual(record['resource.service.name'], 'test-service');
      });
    });

    it('does not inject span context if no span is active', () => {
      assert.strictEqual(getSpan(context.active()), undefined);
      testNoInjection();
    });

    it('does not inject span context if span context is invalid', () => {
      const noopTracer = new NoopTracerProvider().getTracer('noop');
      const span = noopTracer.startSpan('noop');
      context.with(setSpan(context.active(), span), () => {
        testNoInjection();
      });
    });

    it('does not propagate exceptions from user hooks', () => {
      const span = tracer.startSpan('abc');
      instrumentation.setConfig({
        enabled: true,
        logHook: () => {
          throw new Error('Oops');
        },
      });
      context.with(setSpan(context.active(), span), () => {
        testInjection(span);
      });
    });
  });

  describe('disabled instrumentation', () => {
    before(() => {
      instrumentation.disable();
    });

    after(() => {
      instrumentation.enable();
    });

    beforeEach(init);

    it('does not inject span context', () => {
      const span = tracer.startSpan('abc');
      context.with(setSpan(context.active(), span), () => {
        testNoInjection();
      });
    });

    it('does not call log hook', () => {
      const span = tracer.startSpan('abc');
      instrumentation.setConfig({
        enabled: false,
        logHook: (_span, record) => {
          record['resource.service.name'] = 'test-service';
        },
      });
      context.with(setSpan(context.active(), span), () => {
        const record = testNoInjection();
        assert.strictEqual(record['resource.service.name'], undefined);
      });
    });
  });
});
