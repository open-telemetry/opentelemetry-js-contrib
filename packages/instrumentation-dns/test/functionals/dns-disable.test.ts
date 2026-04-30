/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getTestSpans, registerInstrumentationTestingProvider } from '@opentelemetry/contrib-test-utils';
import { context } from '@opentelemetry/api';
import * as assert from 'assert';
import { DnsInstrumentation } from '../../src';
import * as Sinon from 'sinon';
import * as dns from 'dns';

const provider = registerInstrumentationTestingProvider();
const tracer = provider.getTracer('default');

describe('DnsInstrumentation', () => {
  let instrumentation: DnsInstrumentation;

  before(() => {
    instrumentation = new DnsInstrumentation();
    instrumentation.setTracerProvider(provider);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dns');
    // @ts-expect-error __wrapped is injected
    assert.strictEqual(dns.lookup.__wrapped, true);
  });

  beforeEach(() => {
    Sinon.spy(tracer, 'startSpan');
    Sinon.spy(context, 'with');
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe('unpatch()', () => {
    it('should not call tracer methods for creating span', done => {
      instrumentation.disable();
      const hostname = 'localhost';

      dns.lookup(hostname, (err, address, family) => {
        assert.ok(address);
        assert.ok(family);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 0);

        // @ts-expect-error __wrapped is injected
        assert.strictEqual(dns.lookup.__wrapped, undefined);
        assert.strictEqual((context.with as sinon.SinonSpy).called, false);
        done();
      });
    });
  });
});
