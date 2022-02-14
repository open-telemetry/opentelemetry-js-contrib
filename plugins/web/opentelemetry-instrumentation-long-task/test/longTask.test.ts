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
import { trace } from '@opentelemetry/api';
import { hrTimeToMilliseconds, hrTimeToNanoseconds } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import * as tracing from '@opentelemetry/sdk-trace-base';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { LongTaskInstrumentation } from '../src';
import { DummySpanExporter } from './util';

const LONGTASK_DURATION = 50 * 1.1; // add 10% margin
function generateLongTask() {
  const startingTimestamp = performance.now();
  while (performance.now() - startingTimestamp < LONGTASK_DURATION) {}
}

async function waitForLongTask(exportSpy: sinon.SinonStub) {
  let taskStart: number;
  return await new Promise<number>(resolve => {
    // Resolve promise when export gets called
    exportSpy.callsFake(() => {
      if (!taskStart) {
        // Hasn't generated expected longtask yet
        return;
      }
      resolve(taskStart);
    });
    setTimeout(() => {
      // Cleanup any past longtasks
      exportSpy.resetHistory();
      taskStart = performance.timeOrigin + performance.now();
      generateLongTask();
    }, 1);
  });
}

describe('LongTaskInstrumentation', () => {
  let longTaskInstrumentation: LongTaskInstrumentation;
  let sandbox: sinon.SinonSandbox;
  let webTracerProvider: WebTracerProvider;
  let dummySpanExporter: DummySpanExporter;
  let exportSpy: sinon.SinonStub;
  let deregister: () => void;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    webTracerProvider = new WebTracerProvider();
    dummySpanExporter = new DummySpanExporter();
    exportSpy = sandbox.stub(dummySpanExporter, 'export');
    webTracerProvider.addSpanProcessor(
      new tracing.SimpleSpanProcessor(dummySpanExporter)
    );
    webTracerProvider.register();

    longTaskInstrumentation = new LongTaskInstrumentation({
      enabled: false,
    });

    deregister = registerInstrumentations({
      instrumentations: [longTaskInstrumentation],
    });
  });

  afterEach(() => {
    deregister();
    sandbox.restore();
    exportSpy.restore();
    trace.disable();
  });

  it('should report long taking tasks', async () => {
    const taskStart = await waitForLongTask(exportSpy);

    assert.strictEqual(exportSpy.args.length, 1, 'should export once');
    assert.strictEqual(
      exportSpy.args[0][0].length,
      1,
      'should export one span'
    );
    const span: ReadableSpan = exportSpy.args[0][0][0];

    // Span should match expected longtask timings
    assert.ok(
      hrTimeToMilliseconds(span.startTime) <= Math.ceil(taskStart!),
      'span start should be when task started'
    );
    assert.ok(
      hrTimeToNanoseconds(span.duration) > LONGTASK_DURATION,
      "span duration should be longtask's"
    );
  });

  it('should attach additional attributes from callback', async () => {
    deregister();
    const additionalAttributes = { foo: 'bar' };
    longTaskInstrumentation = new LongTaskInstrumentation({
      enabled: false,
      observerCallback: span => {
        span.setAttributes(additionalAttributes);
      },
    });
    deregister = registerInstrumentations({
      instrumentations: [longTaskInstrumentation],
    });

    await waitForLongTask(exportSpy);
    const span: ReadableSpan = exportSpy.args[0][0][0];
    assert.ok(
      Object.entries(additionalAttributes).every(([key, value]) => {
        return span.attributes[key] === value;
      }),
      'span should have key/value pairs from additional attributes'
    );
  });

  it('should not fail to export span if observerCallback throws', async () => {
    deregister();
    const errorCallback = sandbox.stub().throws();
    longTaskInstrumentation = new LongTaskInstrumentation({
      enabled: false,
      observerCallback: errorCallback,
    });
    deregister = registerInstrumentations({
      instrumentations: [longTaskInstrumentation],
    });

    await waitForLongTask(exportSpy);
    assert.strictEqual(
      errorCallback.threw(),
      true,
      'expected callback to throw error'
    );
    assert.strictEqual(
      exportSpy.callCount,
      1,
      'expected export to be called once'
    );
  });
});
