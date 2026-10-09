/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { instrumentation } from './load-instrumentation';
import * as assert from 'node:assert/strict';
import {
  context,
  diag,
  DiagLogLevel,
  metrics,
  trace,
  type Histogram,
} from '@opentelemetry/api';
import {
  hrTimeToSeconds,
  otperformance,
  suppressTracing,
} from '@opentelemetry/core';
import {
  getTestSpans,
  resetMemoryExporter,
  TestMetricReader,
} from '@opentelemetry/contrib-test-utils';
import { DataPointType, MeterProvider } from '@opentelemetry/sdk-metrics';
import { AlwaysOffSampler, TracerProvider } from '@opentelemetry/sdk-trace';
import {
  RunnableLambda,
  RunnableMap,
  RunnableSequence,
} from '@langchain/core/runnables';
import * as sinon from 'sinon';

const metricName = 'gen_ai.invoke_workflow.duration';
const boundaries = [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600, 7200];
const workflow = () =>
  RunnableSequence.from([
    RunnableLambda.from((value: unknown) => value),
    RunnableLambda.from((value: unknown) => value),
  ]);

async function collected(reader: TestMetricReader) {
  const result = await reader.collect();
  assert.deepEqual(result.errors, []);
  return result.resourceMetrics.scopeMetrics.flatMap(scope => scope.metrics);
}

async function histogram(reader: TestMetricReader) {
  const all = await collected(reader);
  assert.equal(all.length, 1);
  const metric = all[0];
  assert.equal(metric.descriptor.name, metricName);
  assert.ok(metric.dataPointType === DataPointType.HISTOGRAM);
  return metric;
}

function diagnostics() {
  const warn = sinon.spy();
  diag.setLogger(
    { warn, error() {}, debug() {}, info() {}, verbose() {} },
    DiagLogLevel.WARN
  );
  return warn;
}

describe('LangChain workflow duration metrics', () => {
  let reader: TestMetricReader;
  let provider: MeterProvider;

  beforeEach(() => {
    reader = new TestMetricReader();
    provider = new MeterProvider({ readers: [reader] });
    instrumentation.setMeterProvider(provider);
    instrumentation.setConfig({ captureMessageContent: 'none' });
    instrumentation.enable();
    resetMemoryExporter();
  });

  afterEach(async () => {
    instrumentation.disable();
    sinon.restore();
    instrumentation.setMeterProvider(metrics.getMeterProvider());
    instrumentation.setTracerProvider(trace.getTracerProvider());
    diag.disable();
    await provider.shutdown();
  });

  for (const capture of ['none', 'span_only'] as const) {
    it(`uses workflow buckets and seconds matching the span (capture=${capture})`, async () => {
      let now = 1000;
      sinon.stub(otperformance, 'now').callsFake(() => now);
      instrumentation.setConfig({ captureMessageContent: capture });
      const flow = RunnableSequence.from([
        RunnableLambda.from((value: string) => {
          now = 2250;
          return value;
        }),
        RunnableLambda.from((value: string) => value),
      ]);
      assert.equal(
        await flow.invoke('private-input', {
          runName: 'application-workflow',
          configurable: { thread_id: 'private-conversation' },
          metadata: { secret: 'private-metadata' },
        }),
        'private-input'
      );
      const metric = await histogram(reader);
      assert.equal(
        metric.descriptor.description,
        'Records duration of GenAI workflow.'
      );
      assert.equal(metric.descriptor.unit, 's');
      assert.equal(metric.dataPoints.length, 1);
      const point = metric.dataPoints[0];
      assert.deepEqual(point.attributes, {
        'gen_ai.workflow.name': 'application-workflow',
      });
      assert.deepEqual(point.value.buckets.boundaries, boundaries);
      assert.equal(point.value.count, 1);
      assert.equal(point.value.sum, 1.25);
      assert.equal(point.value.min, 1.25);
      assert.equal(point.value.max, 1.25);
      assert.deepEqual(
        point.value.buckets.counts,
        [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      );
      assert.equal(getTestSpans().length, 1);
      assert.equal(
        hrTimeToSeconds(getTestSpans()[0].duration),
        point.value.sum
      );
      assert.equal(JSON.stringify(point.attributes).includes('private'), false);
    });
  }

  it('records once per boundary without duplicating inherited Map.batch invocations', async () => {
    const sequence = workflow();
    const map = RunnableMap.from({
      answer: RunnableLambda.from((value: string) => value),
    });
    await sequence.invoke('input');
    await map.invoke('input');
    await sequence.batch(['one', 'two']);
    await map.batch(['one', 'two']);
    const points = (await histogram(reader)).dataPoints;
    assert.equal(points.length, 1);
    assert.deepEqual(points[0].attributes, {});
    assert.equal(points[0].value.count, 5);
    assert.equal(getTestSpans().length, 5);
  });

  it('does not mark a resolved returnExceptions batch as a failed operation', async () => {
    const error = new Error('private returned error');
    const flow = RunnableSequence.from([
      RunnableLambda.from((value: string) => value),
      RunnableLambda.from((value: string) => {
        if (value === 'fail') throw error;
        return value;
      }),
    ]);
    const result = await flow.batch(['ok', 'fail'], undefined, {
      returnExceptions: true,
    });
    assert.equal(result[0], 'ok');
    assert.equal(result[1], error);
    const point = (await histogram(reader)).dataPoints[0];
    assert.deepEqual(point.attributes, {});
    assert.equal(point.value.count, 1);
  });

  for (const method of ['invoke', 'batch'] as const) {
    for (const synchronous of [false, true]) {
      for (const error of [new TypeError('private failure'), undefined]) {
        it(`records ${method} failure once (sync=${synchronous}, error=${typeof error})`, async () => {
          instrumentation.disable();
          sinon.replace(RunnableSequence.prototype, method, () => {
            if (synchronous) throw error;
            return Promise.reject(error);
          });
          instrumentation.enable();
          const flow = workflow();
          const invoke = () =>
            method === 'invoke'
              ? flow.invoke('input', { runName: 'failed-workflow' })
              : flow.batch(['input'], { runName: 'failed-workflow' });
          if (synchronous) {
            assert.throws(invoke, actual => actual === error);
          } else {
            await assert.rejects(invoke, actual => actual === error);
          }
          const points = (await histogram(reader)).dataPoints;
          assert.equal(points.length, 1);
          assert.equal(points[0].value.count, 1);
          assert.deepEqual(points[0].attributes, {
            'gen_ai.workflow.name': 'failed-workflow',
            'error.type': error instanceof TypeError ? 'TypeError' : '_OTHER',
          });
          assert.equal(getTestSpans().length, 1);
          assert.equal(
            points[0].value.sum,
            hrTimeToSeconds(getTestSpans()[0].duration)
          );
          assert.deepEqual(getTestSpans()[0].events, []);
        });
      }
    }
  }

  it('uses name-only error classification without reading sensitive error fields', async () => {
    const warn = diagnostics();
    const error = new Error();
    const sensitive = sinon.spy(() => {
      throw new Error('sensitive getter');
    });
    Object.defineProperties(error, {
      stack: { get: sensitive },
      name: {
        get() {
          throw new Error('private name');
        },
      },
      message: { get: sensitive },
      code: { get: sensitive },
    });
    instrumentation.disable();
    sinon.stub(RunnableSequence.prototype, 'invoke').rejects(error);
    instrumentation.enable();
    await assert.rejects(
      workflow().invoke('input'),
      actual => actual === error
    );
    assert.deepEqual((await histogram(reader)).dataPoints[0].attributes, {
      'error.type': '_OTHER',
    });
    assert.equal(sensitive.callCount, 0);
    assert.ok(
      warn.calledWith(
        sinon.match.string,
        'LangChain: could not classify operation failure'
      )
    );
  });

  it('records with unsampled and no-op tracers without content capture', async () => {
    const unsampled = new TracerProvider({ sampler: new AlwaysOffSampler() });
    try {
      instrumentation.setTracerProvider(unsampled);
      await workflow().invoke('private-input', { runName: 'unsampled' });
      instrumentation.setTracerProvider({
        getTracer: () => ({
          startSpan: () =>
            trace.wrapSpanContext({
              traceId: '00000000000000000000000000000000',
              spanId: '0000000000000000',
              traceFlags: 0,
            }),
          startActiveSpan: () => {
            throw new Error('Unexpected startActiveSpan');
          },
        }),
      });
      await workflow().invoke('private-input');
      const points = (await histogram(reader)).dataPoints;
      assert.equal(points.length, 2);
      assert.deepEqual(
        points.map(point => point.attributes),
        [{ 'gen_ai.workflow.name': 'unsampled' }, {}]
      );
      assert.deepEqual(
        points.map(point => point.value.count),
        [1, 1]
      );
      assert.equal(getTestSpans().length, 0);
    } finally {
      await unsampled.shutdown();
    }
  });

  it('respects suppression, disable and internal graph adapter exclusion', async () => {
    const flow = workflow();
    await context.with(suppressTracing(context.active()), () =>
      flow.invoke('input')
    );
    await context.with(suppressTracing(context.active()), () =>
      flow.batch(['input'])
    );
    flow.omitSequenceTags = true;
    await flow.invoke('input');
    await flow.batch(['input']);
    instrumentation.disable();
    await workflow().invoke('input');
    await workflow().batch(['input']);
    assert.deepEqual(await collected(reader), []);
    assert.equal(getTestSpans().length, 0);
  });

  it('freezes duration before output serialization or histogram recording overhead', async () => {
    let now = 1000;
    sinon.stub(otperformance, 'now').callsFake(() => now);
    const meter = provider.getMeter('slow-recorder');
    const actualHistogram = meter.createHistogram(metricName);
    const record = (...args: Parameters<Histogram['record']>) => {
      now += 20000;
      actualHistogram.record(...args);
    };
    sinon.stub(meter, 'createHistogram').returns({ record });
    instrumentation.setMeterProvider({ getMeter: () => meter });
    instrumentation.setConfig({ captureMessageContent: 'span_only' });
    const output = [
      {
        role: 'assistant',
        content: [
          {
            type: 'custom',
            value: {
              toJSON() {
                now += 10000;
                return 'private-output';
              },
            },
          },
        ],
      },
    ];
    instrumentation.disable();
    sinon.stub(RunnableSequence.prototype, 'invoke').callsFake(() => {
      now = 3500;
      return Promise.resolve(output);
    });
    instrumentation.enable();
    assert.equal(await workflow().invoke('input'), output);
    const point = (await histogram(reader)).dataPoints[0];
    assert.equal(now, 33500);
    assert.equal(point.value.sum, 2.5);
    assert.equal(hrTimeToSeconds(getTestSpans()[0].duration), 2.5);
  });

  it('keeps in-flight samples on their original meter and attribute snapshot', async () => {
    const secondReader = new TestMetricReader();
    const secondProvider = new MeterProvider({ readers: [secondReader] });
    let release!: (value: string) => void;
    const pending = new Promise<string>(resolve => {
      release = resolve;
    });
    const flow = RunnableSequence.from([
      RunnableLambda.from(() => pending),
      RunnableLambda.from((value: string) => value),
    ]);
    const options = {
      runName: 'original-name',
      metadata: { session_id: 'private' },
    };
    try {
      const result = flow.invoke('input', options);
      options.runName = 'mutated-name';
      instrumentation.setMeterProvider(secondProvider);
      instrumentation.setConfig({ captureMessageContent: 'span_only' });
      await workflow().invoke('second', { runName: 'new-name' });
      instrumentation.disable();
      release('answer');
      assert.equal(await result, 'answer');
      const original = (await histogram(reader)).dataPoints;
      const updated = (await histogram(secondReader)).dataPoints;
      assert.deepEqual(
        original.map(p => [p.attributes, p.value.count]),
        [[{ 'gen_ai.workflow.name': 'original-name' }, 1]]
      );
      assert.deepEqual(
        updated.map(p => [p.attributes, p.value.count]),
        [[{ 'gen_ai.workflow.name': 'new-name' }, 1]]
      );
    } finally {
      release('answer');
      await secondProvider.shutdown();
    }
  });

  it('passes invocation context to the histogram and contains record failures', async () => {
    const warn = diagnostics();
    const record = sinon.stub().throws(new Error('private metric failure'));
    const meter = provider.getMeter('throwing-meter');
    sinon.stub(meter, 'createHistogram').returns({ record });
    instrumentation.setMeterProvider({ getMeter: () => meter });
    assert.equal(await workflow().invoke('input'), 'input');
    assert.equal(record.callCount, 1);
    assert.deepEqual(record.firstCall.args[1], {});
    assert.equal(
      trace.getSpan(record.firstCall.args[2])?.spanContext().spanId,
      getTestSpans()[0].spanContext().spanId
    );
    assert.equal(getTestSpans().length, 1);
    assert.ok(
      warn.calledWith(
        sinon.match.string,
        'LangChain: could not record workflow duration'
      )
    );
    assert.equal(
      JSON.stringify(warn.args).includes('private metric failure'),
      false
    );
    const failure = new TypeError('private SDK failure');
    const broken = RunnableSequence.from([
      RunnableLambda.from(() => {
        throw failure;
      }),
      RunnableLambda.from(value => value),
    ]);
    await assert.rejects(broken.invoke('input'), error => error === failure);
    assert.equal(record.callCount, 2);
    assert.deepEqual(record.secondCall.args[1], { 'error.type': 'TypeError' });
    assert.equal(getTestSpans().length, 2);
  });

  it('records metrics even if a span processor throws when ending', async () => {
    const tracerProvider = new TracerProvider({
      spanProcessors: [
        {
          onStart() {},
          onEnd() {
            throw new Error('private processor failure');
          },
          async forceFlush() {},
          async shutdown() {},
        },
      ],
    });
    instrumentation.setTracerProvider(tracerProvider);
    try {
      assert.equal(await workflow().invoke('input'), 'input');
      assert.equal((await histogram(reader)).dataPoints[0].value.count, 1);
    } finally {
      await tracerProvider.shutdown();
    }
  });

  it('contains histogram creation failure and does not reuse the old meter for new calls', async () => {
    const warn = diagnostics();
    const meter = provider.getMeter('bad-meter');
    sinon
      .stub(meter, 'createHistogram')
      .throws(new Error('private meter failure'));
    assert.doesNotThrow(() =>
      instrumentation.setMeterProvider({ getMeter: () => meter })
    );
    assert.equal(await workflow().invoke('input'), 'input');
    assert.equal(getTestSpans().length, 1);
    assert.deepEqual(await collected(reader), []);
    assert.ok(
      warn.calledWith(
        sinon.match.string,
        'LangChain: could not create workflow duration metric'
      )
    );
    assert.equal(
      JSON.stringify(warn.args).includes('private meter failure'),
      false
    );
  });
});
