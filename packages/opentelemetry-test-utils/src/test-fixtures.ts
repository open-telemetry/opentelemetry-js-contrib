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

// Utilities for running test files out-of-process. See `runTestFixture()` below.

import * as assert from 'assert';
import { execFile } from 'child_process';
import { EventEmitter } from 'stream';
import { IncomingMessage, ServerResponse, createServer } from 'http';
import type { AddressInfo } from 'net';
import { URL } from 'url';
import { createGunzip } from 'zlib';

import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import { IInstrumentationScope, IResource, ISpan } from './otlp-types';

/**
 * A utility for scripts that will be run with `runTestFixture()` to create an
 * appropriately configured NodeSDK.
 *
 * Typically, when run via `runTestFixture`, OTEL_EXPORTER_OTLP_ENDPOINT will be
 * set to export to a test collector. When that envvar is not set, this falls
 * back to exporting to the console for dev convenience.
 */
export function createTestNodeSdk(opts: {
  serviceName?: string;
  instrumentations: (Instrumentation | Instrumentation[])[];
}) {
  const spanProcessor = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? undefined
    : new tracing.SimpleSpanProcessor(new tracing.ConsoleSpanExporter());
  const sdk = new NodeSDK({
    serviceName: opts.serviceName || 'test-service',
    spanProcessor,
    instrumentations: opts.instrumentations,
  });
  return sdk;
}

// TestSpan is an OTLP span plus references to `resource` and
// `instrumentationScope` that are shared between multiple spans in the
// protocol.
export type TestSpan = ISpan & {
  resource: IResource;
  instrumentationScope: IInstrumentationScope;
};

/**
 * A minimal HTTP server that can act as an OTLP HTTP/JSON protocol collector.
 * It stores the received data for later test assertions.
 *
 * Limitations: This only supports traces so far, no metrics or logs.
 * There is little error checking here; we are assuming valid OTLP.
 */
export class TestCollector {
  endpointUrl?: string;
  spans: Array<TestSpan> = [];
  private _http;

  constructor() {
    this.clear();
    this._http = createServer(this._onRequest.bind(this));
  }

  clear(): void {
    this.spans = [];
  }

  // Start listening and set address to `endpointUrl`.
  async start(): Promise<void> {
    return new Promise(resolve => {
      this._http.listen(() => {
        this.endpointUrl = `http://localhost:${
          (this._http.address() as AddressInfo).port
        }`;
        resolve();
      });
    });
  }

  close() {
    this.endpointUrl = undefined;
    return this._http.close();
  }

  /**
   * Return the spans sorted by which started first, for testing convenience.
   *
   * Note: This sorting is a *best effort*. `span.startTimeUnixNano` has
   * millisecond accuracy, so if multiple spans start in the same millisecond
   * then this cannot know the start ordering. If `startTimeUnixNano` are the
   * same, this attempts to get the correct ordering using `parentSpanId` -- a
   * parent span starts before any of its direct children. This isn't perfect.
   */
  get sortedSpans(): Array<TestSpan> {
    return this.spans.slice().sort((a, b) => {
      assert(typeof a.startTimeUnixNano === 'string');
      assert(typeof b.startTimeUnixNano === 'string');
      const aStartInt = BigInt(a.startTimeUnixNano);
      const bStartInt = BigInt(b.startTimeUnixNano);
      if (aStartInt < bStartInt) {
        return -1;
      } else if (aStartInt > bStartInt) {
        return 1;
      } else {
        // Same startTimeUnixNano, which has millisecond accuracy. This is
        // common for Express middleware spans on a fast enough dev machine.
        // Attempt to use spanId/parentSpanId to decide on span ordering.
        if (a.traceId === b.traceId) {
          if (a.spanId === b.parentSpanId) {
            return -1;
          } else if (a.parentSpanId === b.spanId) {
            return 1;
          }
        }
        return 0;
      }
    });
  }

  _onRequest(req: IncomingMessage, res: ServerResponse) {
    const parsedUrl = new URL(req.url as string, this.endpointUrl);
    let instream: EventEmitter;
    if (req.headers['content-encoding'] === 'gzip') {
      instream = req.pipe(createGunzip());
    } else {
      req.setEncoding('utf8');
      instream = req;
    }

    let body = '';
    instream.on('data', (chunk: Buffer) => {
      body += chunk;
    });

    instream.on('end', () => {
      let resStatusCode;
      const resHeaders = { 'content-type': 'application/json' };
      let resBody = '';
      if (req.method === 'POST' && parsedUrl.pathname === '/v1/traces') {
        if (req.headers['content-type'] !== 'application/json') {
          resStatusCode = 415;
          resBody = JSON.stringify({ message: 'invalid content-type' });
        } else {
          this._ingestTraces(body);
          resStatusCode = 200;
          // A full success ExportTraceServiceResponse.
          // https://github.com/open-telemetry/opentelemetry-proto/blob/v1.0.0/opentelemetry/proto/collector/trace/v1/trace_service.proto
          resBody = '{}';
        }
      } else {
        resStatusCode = 404;
      }

      res.writeHead(resStatusCode, resHeaders);
      res.end(resBody);
    });
  }

  _ingestTraces(body: string) {
    const data = JSON.parse(body);
    // Read an OTLP `resourceSpans` body into `this.spans`.
    for (const resourceSpan of data.resourceSpans) {
      for (const scopeSpan of resourceSpan.scopeSpans) {
        for (const span of scopeSpan.spans) {
          span.resource = resourceSpan.resource;
          span.instrumentationScope = scopeSpan.scope;
          this.spans.push(span);
        }
      }
    }
  }
}

export type RunTestFixtureOptions = {
  /** Arguments to `node` executable. */
  argv: Array<string>;
  cwd?: string;
  env?: Record<string, string>;
  /** Timeout for the executed process in milliseconds. Defaults to 10s. */
  timeoutMs?: number;
  /** Check the process result. */
  checkResult?: (err: Error | null, stdout: string, stderr: string) => void;
  /** Check the collected results, e.g. via `collector.sortedSpans`. */
  checkCollector?: (collector: TestCollector) => void;
};

/**
 * Run a script that uses otel tracing and check the results.
 *
 * This starts a test collector that is capable of receiving HTTP/JSON OTLP,
 * and sets OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_EXPORTER_OTLP_PROTOCOL
 * appropriately so that scripts using `NodeSDK` will by default send traces
 * to this collector. (See `createTestNodeSdk()` as a convenience for these
 * scripts.)
 *
 * Then the script (given in `argv`) is executed and the optional `opts.check*`
 * callbacks are called so the caller can assert expected process output and
 * collected spans.
 *
 * For example:
 *    await runTestFixture({
 *      argv: ['fixtures/some-esm-script.mjs'],
 *      cwd: __dirname,
 *      env: {
 *        NODE_OPTIONS: '--experimental-loader=@opentelemetry/instrumentation/hook.mjs',
 *        NODE_NO_WARNINGS: '1',
 *      },
 *      checkResult: (err, stdout, stderr) => {
 *        assert.ifError(err);
 *      },
 *      checkCollector: (collector: TestCollector) => {
 *        const spans = collector.sortedSpans;
 *        assert.strictEqual(spans[0].name, 'manual');
 *        // ...
 *      },
 *    });
 */
export async function runTestFixture(
  opts: RunTestFixtureOptions
): Promise<void> {
  const collector = new TestCollector();
  await collector.start();

  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      opts.argv,
      {
        cwd: opts.cwd || process.cwd(),
        timeout: opts.timeoutMs || 10000, // sanity guard on hanging
        env: Object.assign(
          {},
          process.env,
          {
            OTEL_EXPORTER_OTLP_ENDPOINT: collector.endpointUrl,
            OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
          },
          opts.env
        ),
      },
      async function done(err, stdout, stderr) {
        try {
          if (opts.checkResult) {
            await opts.checkResult(err, stdout, stderr);
          }
          if (opts.checkCollector) {
            await opts.checkCollector(collector);
          }
        } catch (err) {
          reject(err);
        } finally {
          collector.close();
          resolve();
        }
      }
    );
  });
}
