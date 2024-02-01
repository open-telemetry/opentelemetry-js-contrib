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
import { Ogma as OgmaClass } from '@ogma/logger';

import { OgmaInstrumentation } from '../src';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const tracer = provider.getTracer('default');
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
context.setGlobalContextManager(new AsyncHooksContextManager());

const kMessage = 'log-message';

describe('OgmaInstrumentation', () => {
  let stream: Writable;
  let writeSpy: sinon.SinonSpy;
  let Ogma: typeof OgmaClass;
  let instrumentation: OgmaInstrumentation;
  let logger: OgmaClass;

  function assertRecord(record: any, span: Span) {
    const { traceId, spanId, traceFlags } = span.spanContext();
    assert.strictEqual(record.meta['trace_id'], traceId);
    assert.strictEqual(record.meta['span_id'], spanId);
    assert.strictEqual(
      record.meta['trace_flags'],
      `0${traceFlags.toString(16)}`
    );
    assert.strictEqual(kMessage, record['message']);
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
    assert.strictEqual(record.meta?.['trace_id'], undefined);
    assert.strictEqual(record.meta?.['span_id'], undefined);
    assert.strictEqual(record.meta?.['trace_flags'], undefined);
    assert.strictEqual(kMessage, record['message']);
    return record;
  }

  function init() {
    stream = new Writable();
    stream._write = () => {};
    writeSpy = sinon.spy(stream, 'write');
    logger = new Ogma({ stream, json: true });
  }

  before(() => {
    instrumentation = new OgmaInstrumentation();
    instrumentation.enable();
    ({ Ogma } = require('@ogma/logger'));
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

    it('injects span context to records in named export', function () {
      init();
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span);
      });
    });

    it('calls the users log hook', () => {
      const span = tracer.startSpan('abc');
      instrumentation.setConfig({
        enabled: true,
        logHook: (_span, record, level) => {
          record['resource.service.name'] = 'test-service';
          if (
            semver.satisfies(
              JSON.parse(
                readFileSync(resolve('@ogma/logger/package.json')).toString()
              ),
              '>= 3.2.0'
            )
          ) {
            assert.strictEqual(level, 30);
          }
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        const record = testInjection(span);
        assert.strictEqual(
          record.meta['resource.service.name'],
          'test-service'
        );
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
      logger = new Ogma({
        json: true,
        stream: {
          write: (message: unknown) => process.stdout.write(message as string),
        },
      });
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        logger.info(kMessage);
      });
      const record = JSON.parse(stdoutSpy.firstCall.args[0].toString());
      assertRecord(record, span);
    });

    it('preserves user options and adds a mixin', () => {
      logger = new Ogma({ application: 'LogLog', stream, json: true });

      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        const record = testInjection(span);
        assert.strictEqual(record['application'], 'LogLog');
      });
    });

    describe('binary arguments', () => {
      it('is possible to construct logger with undefined options', () => {
        logger = new Ogma({ stream, json: true });
        const span = tracer.startSpan('abc');
        context.with(trace.setSpan(context.active(), span), () => {
          testInjection(span);
        });
      });

      it('ensures user mixin values take precedence', () => {
        logger = new Ogma({
          mixin() {
            return { trace_id: '123' };
          },
          stream,
          json: true,
        });

        const span = tracer.startSpan('abc');
        context.with(trace.setSpan(context.active(), span), () => {
          logger.info(kMessage);
        });

        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record.meta['trace_id'], '123');
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

    beforeEach(() => init());

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
          record.meta['resource.service.name'] = 'test-service';
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        const record = testNoInjection();
        assert.strictEqual(record.meta?.['resource.service.name'], undefined);
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
