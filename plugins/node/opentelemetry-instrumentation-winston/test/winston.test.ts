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
import { isWrapped } from '@opentelemetry/instrumentation';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Writable } from 'stream';
import type { Winston2Logger, Winston3Logger } from '../src/internal-types';
import { WinstonInstrumentation } from '../src';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const tracer = provider.getTracer('default');
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
context.setGlobalContextManager(new AsyncHooksContextManager());

const kMessage = 'log-message';

describe('WinstonInstrumentation', () => {
  let logger: Winston3Logger | Winston2Logger;
  let writeSpy: sinon.SinonSpy;
  let instrumentation: WinstonInstrumentation;

  function initLogger() {
    const winston = require('winston');
    const stream = new Writable();
    stream._write = () => {};
    writeSpy = sinon.spy(stream, 'write');

    if (winston['createLogger']) {
      // winston 3.x
      logger = winston.createLogger({
        transports: [
          new winston.transports.Stream({
            stream,
          }),
        ],
      });
    } else if (winston['Logger']) {
      // winston 2.x
      logger = new winston.Logger({
        transports: [
          new winston.transports.File({
            stream,
          }),
        ],
      });
    }
  }

  function testInjection(span: Span) {
    logger.info(kMessage);
    sinon.assert.calledOnce(writeSpy);
    const { traceId, spanId, traceFlags } = span.spanContext();
    const record = JSON.parse(writeSpy.firstCall.args[0].toString());
    assert.strictEqual(record['trace_id'], traceId);
    assert.strictEqual(record['span_id'], spanId);
    assert.strictEqual(record['trace_flags'], `0${traceFlags.toString(16)}`);
    assert.strictEqual(kMessage, record['message']);
    return record;
  }

  function testNoInjection() {
    logger.info(kMessage);
    sinon.assert.calledOnce(writeSpy);
    const record = JSON.parse(writeSpy.firstCall.args[0].toString());
    assert.strictEqual(record['trace_id'], undefined);
    assert.strictEqual(record['span_id'], undefined);
    assert.strictEqual(record['trace_flags'], undefined);
    assert.strictEqual(kMessage, record['message']);
    return record;
  }

  before(() => {
    instrumentation = new WinstonInstrumentation();
    instrumentation.enable();
  });

  describe('enabled instrumentation', () => {
    beforeEach(initLogger);

    it('wraps write', () => {
      if ('write' in logger) {
        // winston 3.x
        assert.ok(isWrapped(logger['write']));
      } else {
        // winston 2.x
        // winston 3.x also has "log", so the order for the checks has to be this
        assert.ok(isWrapped(logger['log']));
      }
    });

    it('injects span context to records', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span);
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

  describe('disabled instrumentation', () => {
    before(() => {
      instrumentation.disable();
    });

    after(() => {
      instrumentation.enable();
    });

    beforeEach(initLogger);

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
  });
});
