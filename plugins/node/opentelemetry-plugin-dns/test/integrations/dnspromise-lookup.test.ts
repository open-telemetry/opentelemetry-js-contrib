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
} from '@opentelemetry/tracing';
import * as assert from 'assert';
import { NoopLogger } from '@opentelemetry/core';
import { NodeTracerProvider } from '@opentelemetry/node';
import { plugin } from '../../src/dns';
import * as dns from 'dns';
import * as utils from '../utils/utils';
import * as semver from 'semver';
import { assertSpan } from '../utils/assertSpan';
import { CanonicalCode } from '@opentelemetry/api';

const memoryExporter = new InMemorySpanExporter();
const logger = new NoopLogger();
const provider = new NodeTracerProvider({ logger });
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
  before(function (done) {
    // if node version is supported, it's mandatory for CI
    if (process.env.CI) {
      plugin.enable(dns, provider, provider.logger);
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
    plugin.enable(dns, provider, provider.logger);
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  after(() => {
    plugin.disable();
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

    it('should export a valid span with error NOT_FOUND', async () => {
      const hostname = 'ᚕ';
      try {
        await lookupPromise(hostname);
        assert.fail();
      } catch (error) {
        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;

        assert.strictEqual(spans.length, 1);
        assertSpan(span, {
          addresses: [],
          hostname,
          forceStatus: {
            code: CanonicalCode.NOT_FOUND,
            message: error!.message,
          },
        });
      }
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
        if (semver.lt(process.versions.node, '9.0.0')) {
          assertSpan(span, {
            addresses: [],
            // tslint:disable-next-line:no-any
            hostname: hostname as any,
            forceStatus: {
              code: CanonicalCode.UNKNOWN,
              message: error!.message,
            },
          });
        } else {
          assertSpan(span, {
            addresses: [],
            // tslint:disable-next-line:no-any
            hostname: hostname as any,
            forceStatus: {
              code: CanonicalCode.INVALID_ARGUMENT,
              message: error!.message,
            },
          });
        }
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
        if (semver.lt(process.versions.node, '9.0.0')) {
          assertSpan(span, {
            addresses: [],
            // tslint:disable-next-line:no-any
            hostname: hostname as any,
            forceStatus: {
              code: CanonicalCode.UNKNOWN,
              message: error!.message,
            },
          });
        } else {
          assertSpan(span, {
            addresses: [],
            // tslint:disable-next-line:no-any
            hostname: hostname as any,
            forceStatus: {
              code: CanonicalCode.INVALID_ARGUMENT,
              message: error!.message,
            },
          });
        }
      }
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
