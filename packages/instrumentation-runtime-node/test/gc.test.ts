/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert';
import * as perf_hooks from 'node:perf_hooks';
import * as sinon from 'sinon';
import { Meter } from '@opentelemetry/api';

import { GCCollector } from '../src/metrics/gcCollector';
import { ATTR_V8JS_GC_TYPE, METRIC_V8JS_GC_DURATION } from '../src/semconv';

describe('GCCollector', function () {
  afterEach(function () {
    sinon.restore();
  });

  it('should configure GC duration histogram with sub-second buckets', function () {
    const createHistogram = sinon.stub().returns({
      record: sinon.stub(),
    });
    const meter = {
      createHistogram,
    } as unknown as Meter;

    const collector = new GCCollector();
    collector.updateMetricInstruments(meter);

    sinon.assert.calledOnce(createHistogram);
    const [name, options] = createHistogram.firstCall.args;

    assert.strictEqual(name, METRIC_V8JS_GC_DURATION);
    assert.deepStrictEqual(
      options.advice?.explicitBucketBoundaries,
      [
        0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5,
        10,
      ]
    );
  });

  it('should record every GC entry delivered in a single observer callback', function () {
    const PerformanceObserver = sinon
      .stub(perf_hooks, 'PerformanceObserver')
      .returns({ observe: sinon.stub(), disconnect: sinon.stub() });
    const record = sinon.stub();
    const meter = {
      createHistogram: sinon.stub().returns({ record }),
    } as unknown as Meter;

    const collector = new GCCollector();
    collector.updateMetricInstruments(meter);
    collector.enable();

    const observerCallback = PerformanceObserver.firstCall.args[0];
    observerCallback({
      getEntries: () => [
        {
          duration: 1,
          detail: { kind: perf_hooks.constants.NODE_PERFORMANCE_GC_MINOR },
        },
        {
          duration: 2,
          detail: { kind: perf_hooks.constants.NODE_PERFORMANCE_GC_MAJOR },
        },
        {
          duration: 3,
          detail: {
            kind: perf_hooks.constants.NODE_PERFORMANCE_GC_INCREMENTAL,
          },
        },
      ],
    });

    assert.deepStrictEqual(record.args, [
      [0.001, { [ATTR_V8JS_GC_TYPE]: 'minor' }],
      [0.002, { [ATTR_V8JS_GC_TYPE]: 'major' }],
      [0.003, { [ATTR_V8JS_GC_TYPE]: 'incremental' }],
    ]);
  });
});
