/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Utilities for running test files out-of-process. See `runTestFixture()` below.

import * as assert from 'assert';
import { execFile } from 'child_process';
import { EventEmitter } from 'stream';
import { IncomingMessage, ServerResponse, createServer } from 'http';
import type { AddressInfo } from 'net';
import { URL } from 'url';
import { createGunzip } from 'zlib';

import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace';
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
  const spanProcessors = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? undefined
    : [new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() })];
  const sdk = new NodeSDK({
    serviceName: opts.serviceName || 'test-service',
    spanProcessors,
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
  public endpointUrl?: string;
  public spans: Array<TestSpan> = [];
  private _http;

  constructor() {
    this.clear();
    this._http = createServer(this._onRequest.bind(this));
  }

  public clear(): void {
    this.spans = [];
  }

  // Start listening and set address to `endpointUrl`.
  public async start(): Promise<void> {
    return new Promise(resolve => {
      this._http.listen(() => {
        this.endpointUrl = `http://localhost:${
          (this._http.address() as AddressInfo).port
        }`;
        resolve();
      });
    });
  }

  public close() {
    this.endpointUrl = undefined;
    return this._http.close();
  }

  /**
   * Return the spans sorted by which started first, for testing convenience.
   *
   * This sorting is a *best effort*.
   * `span.startTimeUnixNano` has millisecond accuracy, so spans that start in
   * the same millisecond are additionally ordered so that every span follows
   * its ancestors. Unrelated spans with the same start time keep the order in
   * which they were received.
   */
  public get sortedSpans(): Array<TestSpan> {
    const byStart = this.spans.slice().sort((a, b) => {
      assert.ok(typeof a.startTimeUnixNano === 'string');
      assert.ok(typeof b.startTimeUnixNano === 'string');
      const aStartInt = BigInt(a.startTimeUnixNano);
      const bStartInt = BigInt(b.startTimeUnixNano);
      return aStartInt < bStartInt ? -1 : aStartInt > bStartInt ? 1 : 0;
    });

    // A pairwise parent/child tie-break is not transitive (a grandchild compares
    // equal to its grandparent), so ancestors are placed in a second pass.
    const spanIds = new Set(byStart.map(span => span.spanId));
    const placed = new Set<TestSpan['spanId']>();
    const waiting = new Map<TestSpan['spanId'], Array<TestSpan>>();
    const sorted: Array<TestSpan> = [];
    const place = (span: TestSpan) => {
      sorted.push(span);
      placed.add(span.spanId);
      const children = waiting.get(span.spanId) ?? [];
      waiting.delete(span.spanId);
      children.forEach(place);
    };
    for (const span of byStart) {
      const parentId = span.parentSpanId;
      if (parentId && spanIds.has(parentId) && !placed.has(parentId)) {
        waiting.set(parentId, [...(waiting.get(parentId) ?? []), span]);
      } else {
        place(span);
      }
    }
    return sorted;
  }

  private _onRequest(req: IncomingMessage, res: ServerResponse) {
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

  private _ingestTraces(body: string) {
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
