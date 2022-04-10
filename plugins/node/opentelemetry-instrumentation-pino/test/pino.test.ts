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
import { context, trace, Span, INVALID_SPAN_CONTEXT } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { Writable } from 'stream';
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as semver from 'semver';
import type { pino as Pino } from 'pino';

import { PinoInstrumentation } from '../src';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const tracer = provider.getTracer('default');
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
context.setGlobalContextManager(new AsyncHooksContextManager());

const kMessage = 'log-message';

describe('PinoInstrumentation', () => {
  let stream: Writable;
  let writeSpy: sinon.SinonSpy;
  let pino: typeof Pino;
  let instrumentation: PinoInstrumentation;
  let logger: Pino.Logger;

  function assertRecord(record: any, span: Span) {
    const { traceId, spanId, traceFlags } = span.spanContext();
    assert.strictEqual(record['trace_id'], traceId);
    assert.strictEqual(record['span_id'], spanId);
    assert.strictEqual(record['trace_flags'], `0${traceFlags.toString(16)}`);
    assert.strictEqual(kMessage, record['msg']);
  }

  function assertInjection(span: Span) {
    sinon.assert.calledOnce(writeSpy);
    const record = JSON.parse(writeSpy.firstCall.args[0].toString());
    assertRecord(record, span);
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
    });

    it('injects span context to records', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span);
      });
    });

    it('injects span context to child logger records', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        const child = logger.child({ foo: 42 });
        child.info(kMessage);
        assertInjection(span);
      });
    });

    it('calls the users log hook', () => {
      const span = tracer.startSpan('abc');
      instrumentation.setConfig({
        enabled: true,
        logHook: (_span, record, level) => {
          record['resource.service.name'] = 'test-service';
          if (semver.satisfies(pino.version, '>= 7.9.0')) {
            assert.strictEqual(level, 30);
          }
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        const record = testInjection(span);
        assert.strictEqual(record['resource.service.name'], 'test-service');
      });
    });

    it('does not inject span context if no span is active', () => {
      assert.strictEqual(trace.getSpan(context.active()), undefined);
      testNoInjection();
    });

    it('does not inject span context if span context is invalid', () => {
      const span = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
      context.with(trace.setSpan(context.active(), span), () => {
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
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span);
      });
    });
  });

  describe('logger construction', () => {
    let stdoutSpy: sinon.SinonSpy;

    beforeEach(() => {
      stream = new Writable();
      stream._write = () => {};
      writeSpy = sinon.spy(stream, 'write');
      stdoutSpy = sinon.spy(process.stdout, 'write');
    });

    afterEach(() => {
      stdoutSpy.restore();
    });

    it('does not fail when constructing logger without arguments', () => {
      logger = pino();
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        logger.info(kMessage);
      });
      const record = JSON.parse(stdoutSpy.firstCall.args[0].toString());
      assertRecord(record, span);
    });

    it('preserves user options and adds a mixin', () => {
      logger = pino({ name: 'LogLog' }, stream);

      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        const record = testInjection(span);
        assert.strictEqual(record['name'], 'LogLog');
      });
    });

    describe('binary arguments', () => {
      it('is possible to construct logger with undefined options', () => {
        logger = pino(undefined as unknown as Pino.LoggerOptions, stream);
        const span = tracer.startSpan('abc');
        context.with(trace.setSpan(context.active(), span), () => {
          testInjection(span);
        });
      });

      it('preserves user mixins', () => {
        logger = pino(
          {
            name: 'LogLog',
            mixin: () => ({ a: 2, b: 'bar' }),
          },
          stream
        );

        const span = tracer.startSpan('abc');
        context.with(trace.setSpan(context.active(), span), () => {
          const record = testInjection(span);
          assert.strictEqual(record['a'], 2);
          assert.strictEqual(record['b'], 'bar');
          assert.strictEqual(record['name'], 'LogLog');
        });
      });

      it('ensures user mixin values take precedence', () => {
        logger = pino(
          {
            mixin() {
              return { trace_id: '123' };
            },
          },
          stream
        );

        const span = tracer.startSpan('abc');
        context.with(trace.setSpan(context.active(), span), () => {
          logger.info(kMessage);
        });

        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], '123');
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
      context.with(trace.setSpan(context.active(), span), () => {
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
      context.with(trace.setSpan(context.active(), span), () => {
        const record = testNoInjection();
        assert.strictEqual(record['resource.service.name'], undefined);
      });
    });

    it('injects span context once re-enabled', () => {
      instrumentation.enable();
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span);
      });
    });
  });
});
