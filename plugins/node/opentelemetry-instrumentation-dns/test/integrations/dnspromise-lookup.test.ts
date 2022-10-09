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
import * as assert from 'assert';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { DnsInstrumentation, DnsInstrumentationConfig } from '../../src';
import * as dns from 'dns';
import * as utils from '../utils/utils';
import { assertSpan } from '../utils/assertSpan';
import { SpanStatusCode } from '@opentelemetry/api';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

async function lookupPromise(
  hostname: string,
  options: dns.LookupOptions = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, options, (err, address, family) => {
      if (err) reject(err);
      if (options.all) {
        resolve(address);
      } else {
        resolve({ address, family });
      }
    });
  });
}

describe('dns.promises.lookup()', () => {
  let instrumentation: DnsInstrumentation;

  before(function (done) {
    // if node version is supported, it's mandatory for CI
    if (process.env.CI) {
      instrumentation = new DnsInstrumentation();
      instrumentation.setTracerProvider(provider);
      require('dns');
      done();
      return;
    }

    utils.checkInternet(isConnected => {
      if (!isConnected) {
        this.skip();
        // don't disturb people
      }
      done();
    });
    instrumentation = new DnsInstrumentation();
    instrumentation.setTracerProvider(provider);
    require('dns');
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  after(() => {
    instrumentation.disable();
  });

  describe('with family param', () => {
    [4, 6].forEach(ipversion => {
      it(`should export a valid span with "family" arg to ${ipversion}`, async () => {
        const hostname = 'google.com';
        const { address, family } = await lookupPromise(hostname, {
          family: ipversion,
        });
        assert.ok(address);
        assert.ok(family);

        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        assertSpan(span, { addresses: [{ address, family }], hostname });
      });
    });
  });

  describe('with no options param', () => {
    it('should export a valid span', async () => {
      const hostname = 'google.com';
      const { address, family } = await lookupPromise(hostname);

      assert.ok(address);
      assert.ok(family);

      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpan(span, { addresses: [{ address, family }], hostname });
    });

    describe('extended timeout', function () {
      const unresolvableHostname = 'ᚕ';
      // Extending the default timeout as some environments are taking longer than 2 seconds to fail
      // So rather than fail the test -- just take a little longer
      this.timeout(10000);

      it('should export a valid span with error NOT_FOUND', async () => {
        try {
          await lookupPromise(unresolvableHostname);
          assert.fail();
        } catch (error) {
          const spans = memoryExporter.getFinishedSpans();
          const [span] = spans;

          assert.strictEqual(spans.length, 1);
          assertSpan(span, {
            addresses: [],
            forceStatus: {
              code: SpanStatusCode.ERROR,
              message: error!.message,
            },
            hostname: unresolvableHostname,
          });
        }
      });
    });

    it('should export a valid span with error INVALID_ARGUMENT when "family" param is equal to -1', async () => {
      const hostname = 'google.com';
      try {
        await lookupPromise(hostname, { family: -1 });
        assert.fail();
      } catch (error) {
        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;

        assert.strictEqual(spans.length, 1);
        assertSpan(span, {
          addresses: [],
          forceStatus: {
            code: SpanStatusCode.ERROR,
            message: error!.message,
          },
          hostname,
        });
      }
    });

    it('should export a valid span with error INVALID_ARGUMENT when "hostname" param is a number', async () => {
      const hostname = 1234;
      try {
        // tslint:disable-next-line:no-any
        await lookupPromise(hostname as any, { family: 4 });
        assert.fail();
      } catch (error) {
        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;

        assert.strictEqual(spans.length, 1);
        assertSpan(span, {
          addresses: [],
          forceStatus: {
            code: SpanStatusCode.ERROR,
            message: error!.message,
          },
          hostname: hostname as any,
        });
      }
    });

    describe('dns.hostname attribute', () => {
      afterEach(() => {
        instrumentation.setConfig();
      });

      it('should be included by default', async () => {
        const hostname = 'google.com';
        const config: DnsInstrumentationConfig = {};
        instrumentation.setConfig(config);

        try {
          await lookupPromise(hostname as any, { family: 4 });
          assert.fail();
        } catch (error) {
          const spans = memoryExporter.getFinishedSpans();
          const [span] = spans;

          assert.strictEqual(spans.length, 1);
          assertSpan(span, {
            addresses: [],
            hostname,
          });
        }
      });

      it('should be excluded if omitHostname is true', async () => {
        const hostname = 'google.com';
        instrumentation.setConfig({
          omitHostnameAttribute: true,
        } as DnsInstrumentationConfig);

        try {
          await lookupPromise(hostname as any, { family: 4 });
          assert.fail();
        } catch (error) {
          const spans = memoryExporter.getFinishedSpans();
          const [span] = spans;

          assert.strictEqual(spans.length, 1);
          assertSpan(span, {
            addresses: [],
            hostname: undefined,
          });
        }
      });
    });
  });

  describe('with options param', () => {
    [4, 6].forEach(ipversion => {
      it(`should export a valid span with "family" to ${ipversion}`, async () => {
        const hostname = 'google.com';
        const { address, family } = await lookupPromise(hostname, {
          family: ipversion,
        });

        assert.ok(address);
        assert.ok(family);

        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);

        assertSpan(span, { addresses: [{ address, family }], hostname });
      });

      it(`should export a valid span when setting "verbatim" property to true and "family" to ${ipversion}`, async () => {
        const hostname = 'google.com';
        const { address, family } = await lookupPromise(hostname, {
          family: ipversion,
          verbatim: true,
        });

        assert.ok(address);
        assert.ok(family);

        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);

        assertSpan(span, { addresses: [{ address, family }], hostname });
      });
    });

    it('should export a valid span when setting "all" property to true', async () => {
      const hostname = 'montreal.ca';
      const addresses = await lookupPromise(hostname, { all: true });

      assert.ok(addresses instanceof Array);

      const spans = memoryExporter.getFinishedSpans();
      const [span] = spans;
      assert.strictEqual(spans.length, 1);
      assertSpan(span, { addresses, hostname });
    });
  });
});
