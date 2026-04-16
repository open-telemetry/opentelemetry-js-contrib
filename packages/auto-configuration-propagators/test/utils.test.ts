/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import { getPropagator } from '../src/utils';

describe('utils', () => {
  describe('getPropagator', () => {
    afterEach(() => {
      delete process.env.OTEL_PROPAGATORS;
    });

    it('should return default when env var is unset', () => {
      assert.deepStrictEqual(getPropagator().fields(), [
        'traceparent',
        'tracestate',
        'baggage',
      ]);
    });

    it('should return default when env var is empty', () => {
      process.env.OTEL_PROPAGATORS = '';
      assert.deepStrictEqual(getPropagator().fields(), [
        'traceparent',
        'tracestate',
        'baggage',
      ]);
    });

    it('should return default when env var is all spaces', () => {
      process.env.OTEL_PROPAGATORS = '  ';
      assert.deepStrictEqual(getPropagator().fields(), [
        'traceparent',
        'tracestate',
        'baggage',
      ]);
    });

    it('should return the selected propagator when one is in the list', () => {
      process.env.OTEL_PROPAGATORS = 'tracecontext';
      assert.deepStrictEqual(getPropagator().fields(), [
        'traceparent',
        'tracestate',
      ]);
    });

    it('should return the selected propagators when multiple are in the list', () => {
      process.env.OTEL_PROPAGATORS = 'b3,jaeger';
      assert.deepStrictEqual(getPropagator().fields(), ['b3', 'uber-trace-id']);
    });

    it('should return no-op propagator if all propagators are unknown', () => {
      process.env.OTEL_PROPAGATORS = 'my, unknown, propagators';
      assert.deepStrictEqual(getPropagator().fields(), []);
    });

    it('should return no-op propagator if "none" is selected', () => {
      process.env.OTEL_PROPAGATORS = 'none';
      assert.deepStrictEqual(getPropagator().fields(), []);
    });
  });
});
