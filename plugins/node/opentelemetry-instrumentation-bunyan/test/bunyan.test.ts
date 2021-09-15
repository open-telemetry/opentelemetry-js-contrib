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
import { context, INVALID_SPAN_CONTEXT, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { isWrapped } from '@opentelemetry/instrumentation';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import * as assert from 'assert';
import * as Logger from 'bunyan';
import * as sinon from 'sinon';
import { Writable } from 'stream';
import { BunyanInstrumentation } from '../src';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const tracer = provider.getTracer('default');
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
context.setGlobalContextManager(new AsyncHooksContextManager());

describe('BunyanInstrumentation', () => {
  let logger: Logger;
  let stream;
  let writeSpy: sinon.SinonSpy;
  let instrumentation: BunyanInstrumentation;

  before(() => {
    instrumentation = new BunyanInstrumentation();
    require('bunyan');
    assert.ok(isWrapped((Logger.prototype as any)['_emit']));
  });

  describe('enabled instrumentation', () => {
    beforeEach(() => {
      instrumentation.setConfig({ enabled: true });
      stream = new Writable();
      stream._write = () => {};
      writeSpy = sinon.spy(stream, 'write');
      logger = Logger.createLogger({ name: 'test', stream });
    });

    it('injects span context to records', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        const { traceId, spanId, traceFlags } = span.spanContext();
        logger.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], traceId);
        assert.strictEqual(record['span_id'], spanId);
        assert.strictEqual(
          record['trace_flags'],
          `0${traceFlags.toString(16)}`
        );
        // Sanity check the message is unchanged
        assert.strictEqual('foo', record['msg']);
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
        logger.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['resource.service.name'], 'test-service');
      });
    });

    it('does not inject span context if no span is active', () => {
      logger.info('foo');
      assert.strictEqual(trace.getSpan(context.active()), undefined);
      sinon.assert.calledOnce(writeSpy);
      const record = JSON.parse(writeSpy.firstCall.args[0].toString());
      assert.strictEqual(record['trace_id'], undefined);
      assert.strictEqual(record['span_id'], undefined);
      assert.strictEqual(record['trace_flags'], undefined);
      assert.strictEqual('foo', record['msg']);
    });

    it('does not inject span context if span context is invalid', () => {
      const span = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
      context.with(trace.setSpan(context.active(), span), () => {
        logger.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], undefined);
        assert.strictEqual(record['span_id'], undefined);
        assert.strictEqual(record['trace_flags'], undefined);
        assert.strictEqual('foo', record['msg']);
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
        const { traceId, spanId } = span.spanContext();
        logger.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], traceId);
        assert.strictEqual(record['span_id'], spanId);
        assert.strictEqual('foo', record['msg']);
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

    beforeEach(() => {
      stream = new Writable();
      stream._write = () => {};
      writeSpy = sinon.spy(stream, 'write');
      logger = Logger.createLogger({ name: 'test', stream });
    });

    it('does not inject span context', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        logger.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['trace_id'], undefined);
        assert.strictEqual(record['span_id'], undefined);
        assert.strictEqual(record['trace_flags'], undefined);
        // Sanity check the message is unchanged
        assert.strictEqual('foo', record['msg']);
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
        logger.info('foo');
        sinon.assert.calledOnce(writeSpy);
        const record = JSON.parse(writeSpy.firstCall.args[0].toString());
        assert.strictEqual(record['resource.service.name'], undefined);
      });
    });
  });
});
