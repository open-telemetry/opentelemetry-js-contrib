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

import * as assert from 'assert';

import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  TestContext,
  TestInstrumentation,
  initTestContext,
  setupInstrumentation,
  testInjection,
  testNoInjection,
} from './common';
import { context, trace } from '@opentelemetry/api';

import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
const tracer = provider.getTracer('default');
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));
context.setGlobalContextManager(new AsyncHooksContextManager());

describe('PinoInstrumentation', () => {
  describe('disabled instrumentation', () => {
    let testInstrumentation: TestInstrumentation;
    let testContext: TestContext;
    before(() => {
      testInstrumentation = setupInstrumentation();
      testContext = initTestContext(testInstrumentation);
      testInstrumentation.instrumentation.disable();
    });
    after(() => testInstrumentation.instrumentation.enable());

    beforeEach(() => {
      testContext = initTestContext(testInstrumentation);
    });

    it('does not inject span context', () => {
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testNoInjection(testContext);
      });
    });

    it('does not call log hook', () => {
      const span = tracer.startSpan('abc');
      testInstrumentation.instrumentation.setConfig({
        enabled: false,
        logHook: (_span, record) => {
          record['resource.service.name'] = 'test-service';
        },
      });
      context.with(trace.setSpan(context.active(), span), () => {
        const record = testNoInjection(testContext);
        assert.strictEqual(record['resource.service.name'], undefined);
      });
    });

    it('injects span context once re-enabled', () => {
      testInstrumentation.instrumentation.enable();
      const span = tracer.startSpan('abc');
      context.with(trace.setSpan(context.active(), span), () => {
        testInjection(span, testContext);
      });
    });
  });
});
