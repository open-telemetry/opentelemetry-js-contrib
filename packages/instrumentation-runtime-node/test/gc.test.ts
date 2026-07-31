/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Meter } from '@opentelemetry/api';

import { GCCollector } from '../src/metrics/gcCollector';
import { METRIC_V8JS_GC_DURATION } from '../src/semconv';

describe('GCCollector', function () {
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
});
