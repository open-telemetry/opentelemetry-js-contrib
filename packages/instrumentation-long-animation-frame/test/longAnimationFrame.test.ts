/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { trace } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace';
import { ReadableSpan } from '@opentelemetry/sdk-trace';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { LongAnimationFrameInstrumentation } from '../src';
import type { PerformanceLongAnimationFrameTiming } from '../src/types';
import { DummySpanExporter } from './util';

function buildLongAnimationFrameEntry(): PerformanceLongAnimationFrameTiming {
  return {
    name: 'long-animation-frame',
    entryType: 'long-animation-frame',
    startTime: 100,
    duration: 60,
    renderStart: 120,
    styleAndLayoutStart: 130,
    blockingDuration: 45,
    firstUIEventTimestamp: 110,
    scripts: [
      {
        name: 'script-name',
        entryType: 'script',
        startTime: 105,
        duration: 20,
        executionStart: 106,
        invoker: 'Window.requestAnimationFrame',
        invokerType: 'event-listener',
        sourceURL: 'https://example.com/app.js',
        sourceFunctionName: 'myFunction',
        sourceCharPosition: 42,
        pauseDuration: 0,
        forcedStyleAndLayoutDuration: 3,
        windowAttribution: 'self',
        window: null,
      },
    ],
  } as unknown as PerformanceLongAnimationFrameTiming;
}

describe('LongAnimationFrameInstrumentation', () => {
  let sandbox: sinon.SinonSandbox;
  let webTracerProvider: WebTracerProvider;
  let dummySpanExporter: DummySpanExporter;
  let exportSpy: sinon.SinonSpy;
  let deregister: () => void;
  let observerCallback: (list: PerformanceObserverEntryList) => void;

  const originalPerformanceObserver = globalThis.PerformanceObserver;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    dummySpanExporter = new DummySpanExporter();
    exportSpy = sandbox.spy(dummySpanExporter, 'export');
    webTracerProvider = new WebTracerProvider({
      spanProcessors: [
        new SimpleSpanProcessor({ exporter: dummySpanExporter }),
      ],
    });
    webTracerProvider.register();

    class FakePerformanceObserver {
      static readonly supportedEntryTypes = ['long-animation-frame'];
      constructor(callback: (list: PerformanceObserverEntryList) => void) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {}
    }
    globalThis.PerformanceObserver =
      FakePerformanceObserver as unknown as typeof PerformanceObserver;

    deregister = registerInstrumentations({
      instrumentations: [
        new LongAnimationFrameInstrumentation({ enabled: false }),
      ],
    });
  });

  afterEach(() => {
    globalThis.PerformanceObserver = originalPerformanceObserver;
    deregister();
    sandbox.restore();
    trace.disable();
  });

  function triggerLongAnimationFrame() {
    assert.ok(observerCallback, 'observer should be registered');
    observerCallback({
      getEntries: () => [buildLongAnimationFrameEntry()],
    } as unknown as PerformanceObserverEntryList);
  }

  it('should export a span with long animation frame attributes', () => {
    triggerLongAnimationFrame();

    assert.strictEqual(exportSpy.callCount, 1, 'should export once');
    const spans: ReadableSpan[] = exportSpy.args[0][0];
    assert.strictEqual(spans.length, 1, 'should export one span');
    const span = spans[0];

    assert.strictEqual(span.name, 'long-animation-frame');
    assert.strictEqual(
      span.attributes['long_animation_frame.name'],
      'long-animation-frame'
    );
    assert.strictEqual(
      span.attributes['long_animation_frame.entry_type'],
      'long-animation-frame'
    );
    assert.strictEqual(span.attributes['long_animation_frame.duration'], 60);
    assert.strictEqual(
      span.attributes['long_animation_frame.blocking_duration'],
      45
    );
    assert.strictEqual(
      span.attributes['long_animation_frame.render_start'],
      120
    );
    assert.strictEqual(
      span.attributes['long_animation_frame.style_and_layout_start'],
      130
    );
    assert.strictEqual(
      span.attributes['long_animation_frame.first_ui_event_timestamp'],
      110
    );
    assert.strictEqual(
      span.attributes['long_animation_frame.script.invoker'],
      'Window.requestAnimationFrame'
    );
    assert.strictEqual(
      span.attributes['long_animation_frame.script.invoker_type'],
      'event-listener'
    );
    assert.strictEqual(
      span.attributes['long_animation_frame.script.source_function_name'],
      'myFunction'
    );
    assert.strictEqual(
      span.attributes['long_animation_frame.script.source_char_position'],
      42
    );
  });

  it('should attach additional attributes from callback', () => {
    deregister();
    deregister = registerInstrumentations({
      instrumentations: [
        new LongAnimationFrameInstrumentation({
          enabled: false,
          observerCallback: span => {
            span.setAttributes({ foo: 'bar' });
          },
        }),
      ],
    });

    triggerLongAnimationFrame();
    const spans: ReadableSpan[] = exportSpy.args[0][0];
    assert.strictEqual(spans[0].attributes['foo'], 'bar');
  });

  it('should not fail to export span if observerCallback throws', () => {
    deregister();
    const errorCallback = sandbox.stub().throws();
    deregister = registerInstrumentations({
      instrumentations: [
        new LongAnimationFrameInstrumentation({
          enabled: false,
          observerCallback: errorCallback,
        }),
      ],
    });

    triggerLongAnimationFrame();
    assert.strictEqual(
      errorCallback.threw(),
      true,
      'expected callback to throw'
    );
    assert.strictEqual(
      exportSpy.callCount,
      1,
      'expected export to be called once'
    );
  });
});
