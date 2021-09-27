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

// Eslint Disable Explain: Only used in tests
// eslint-disable-next-line node/no-unsupported-features/node-builtins
import { TextEncoder, TextDecoder } from 'util';
import {
  SpanStatusCode,
  context,
  SpanKind,
  trace,
  propagation,
} from '@opentelemetry/api';
import { HttpTraceContextPropagator } from '@opentelemetry/core';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  registerInstrumentationTesting,
  getTestSpans,
  resetMemoryExporter,
  startDocker,
  cleanUpDocker,
} from '@opentelemetry/contrib-test-utils';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';
import * as natsTypes from 'nats';
import { NatsInstrumentation } from '../src';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

const instrumentation = registerInstrumentationTesting(
  new NatsInstrumentation()
);

const CONFIG = {
  host: process.env.OPENTELEMETRY_NATS_HOST || '0.0.0.0',
  port: parseInt(process.env.OPENTELEMETRY_NATS_PORT || '4222', 10),
};

const DEFAULT_ATTRIBUTES = {
  [SemanticAttributes.MESSAGING_SYSTEM]: 'nats',
  [SemanticAttributes.MESSAGING_PROTOCOL]: 'nats',
  [SemanticAttributes.NET_PEER_NAME]: CONFIG.host,
  [SemanticAttributes.NET_PEER_PORT]: `${CONFIG.port}`,
};

const sortByStartTime = (a: ReadableSpan, b: ReadableSpan) => {
  const aInMs = a.startTime[0] * 1000000 + a.startTime[1] / 1000;
  const bInMs = b.startTime[0] * 1000000 + b.startTime[1] / 1000;
  return aInMs - bInMs;
};

const URL = `${CONFIG.host}:${CONFIG.port}`;

describe('nats@2.x', () => {
  const provider = new NodeTracerProvider();
  const shouldTestLocal = process.env.RUN_NATS_TESTS_LOCAL;
  const shouldTest = process.env.RUN_NATS_TESTS || shouldTestLocal;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let nats: typeof natsTypes;
  let nc: natsTypes.NatsConnection;

  before(function () {
    // needs to be "function" to have MochaContext "this" context
    if (!shouldTest) {
      // this.skip() workaround
      // https://github.com/mochajs/mocha/issues/2683#issuecomment-375629901
      this.test!.parent!.pending = true;
      this.skip();
    }

    if (shouldTestLocal) {
      startDocker('nats');
    }

    // diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    nats = require('nats');
  });

  after(() => {
    if (shouldTestLocal) {
      cleanUpDocker('nats');
    }
  });

  beforeEach(async () => {
    propagation.setGlobalPropagator(new HttpTraceContextPropagator());
    nc = await nats.connect({ servers: URL });
  });

  afterEach(done => {
    resetMemoryExporter();
    propagation.disable();
    nc.drain().then(done, done);
  });

  it('should have correct module name', () => {
    assert.strictEqual(
      instrumentation.instrumentationName,
      '@opentelemetry/instrumentation-nats'
    );
  });

  describe('#publish', () => {
    it('should create a span', () => {
      const parentSpan = provider.getTracer('default').startSpan('test span');
      context.with(trace.setSpan(context.active(), parentSpan), () => {
        nc.publish('test');
        const spans = getTestSpans();
        assertSpans(spans, [
          {
            subject: 'test',
            op: 'send',
            kind: SpanKind.PRODUCER,
            status: { code: SpanStatusCode.OK },
            parentSpan,
          },
        ]);
      });
    });
  });

  describe('#subscribe (callbacks)', () => {
    it('should create a consumer span', async () => {
      const parentSpan = provider.getTracer('default').startSpan('test span');
      let resolve: (v?: unknown) => void;
      const p = new Promise(r => {
        resolve = r;
      });
      context.with(trace.setSpan(context.active(), parentSpan), () => {
        nc.subscribe('test', {
          max: 1,
          callback: (err, _msg) => {
            assert.strictEqual(err, null);
            resolve();
          },
        });
        nc.publish('test');
      });

      await p;
      const spans = getTestSpans();
      assertSpans(spans, [
        {
          subject: 'test',
          op: 'send',
          kind: SpanKind.PRODUCER,
          parentSpan,
        },
        {
          subject: 'test',
          op: 'process',
          kind: SpanKind.CONSUMER,
          parentSpan: spans[0],
        },
      ]);
    });
  });

  describe('#subscribe (async interator)', () => {
    it('should create a consumer span', async () => {
      const parentSpan = provider.getTracer('default').startSpan('test span');
      await context.with(
        trace.setSpan(context.active(), parentSpan),
        async () => {
          const sub = nc.subscribe('test', {
            max: 1,
          });
          nc.publish('test');
          for await (const _m of sub) {
          }
        }
      );
      const spans = getTestSpans();
      assertSpans(spans, [
        {
          subject: 'test',
          op: 'send',
          kind: SpanKind.PRODUCER,
          parentSpan,
        },
        {
          subject: 'test',
          op: 'process',
          kind: SpanKind.CONSUMER,
          parentSpan: spans[0],
        },
      ]);
    });
  });

  describe('#request and #respond (callbacks)', () => {
    it('creats connected spans for the request/response flow', async () => {
      const parentSpan = provider.getTracer('default').startSpan('test span');
      let resolve: (v?: unknown) => void;
      const p = new Promise(r => {
        resolve = r;
      });
      const res = await context.with(
        trace.setSpan(context.active(), parentSpan),
        () => {
          nc.subscribe('test', {
            max: 1,
            callback: (err, msg) => {
              assert.strictEqual(err, null);
              msg.respond(encoder.encode('ack'));
              resolve();
            },
          });
          return nc.request('test');
        }
      );

      await p;
      assert.ok(res, 'received response');
      assert.strictEqual(
        decoder.decode(res.data),
        'ack',
        'got correct response'
      );
      const spans = [...getTestSpans()].sort(sortByStartTime);
      assertSpans(spans, [
        {
          subject: 'test',
          op: 'request',
          kind: SpanKind.CLIENT,
          parentSpan,
        },
        {
          subject: 'test',
          op: 'send',
          kind: SpanKind.PRODUCER,
          parentSpan: spans[0],
        },
        {
          subject: 'test',
          op: 'process',
          kind: SpanKind.SERVER,
          parentSpan: spans[1],
        },
        {
          subject: '(temporary)',
          op: 'send',
          kind: SpanKind.PRODUCER,
          parentSpan: spans[2],
        },
      ]);
    });
  });

  // Fixme: Uncomment this test once async interators properly persist context
  // when calling Msg#respond
  describe.skip('#request and #respond (async interator)', () => {
    it('creats connected spans for the request/response flow', async () => {
      const parentSpan = provider.getTracer('default').startSpan('test span');
      const res = await context.with(
        trace.setSpan(context.active(), parentSpan),
        async () => {
          const sub = nc.subscribe('test', {
            max: 1,
          });
          const resP = nc.request('test');
          for await (const m of sub) {
            m.respond(encoder.encode('ack'));
          }
          return resP;
        }
      );
      assert.ok(res, 'received response');
      assert.strictEqual(
        decoder.decode(res.data),
        'ack',
        'got correct response'
      );
      const spans = [...getTestSpans()].sort(sortByStartTime);
      assertSpans(spans, [
        {
          subject: 'test',
          op: 'request',
          kind: SpanKind.CLIENT,
          parentSpan,
        },
        {
          subject: 'test',
          op: 'send',
          kind: SpanKind.PRODUCER,
          parentSpan: spans[0],
        },
        {
          subject: 'test',
          op: 'process',
          kind: SpanKind.SERVER,
          parentSpan: spans[1],
        },
        {
          subject: '(temporary)',
          op: 'send',
          kind: SpanKind.PRODUCER,
          parentSpan: spans[2],
        },
      ]);
    });
  });
});

const assertSpans = (actualSpans: any[], expectedSpans: any[]) => {
  assert(Array.isArray(actualSpans), 'Expected `actualSpans` to be an array');
  assert(
    Array.isArray(expectedSpans),
    'Expected `expectedSpans` to be an array'
  );
  assert.strictEqual(
    actualSpans.length,
    expectedSpans.length,
    'Expected span count different from actual'
  );
  actualSpans.forEach((span, idx) => {
    const expected = expectedSpans[idx];
    if (expected === null) return;
    try {
      assert.notStrictEqual(span, undefined);
      assert.notStrictEqual(expected, undefined);
      const [spanSubject, spanOp] = span.name.split(' ', 2);
      assert.strictEqual(spanOp, expected.op, 'span name ends with op');
      assert.strictEqual(
        spanSubject,
        expected.subject,
        'span name starts with subject'
      );
      assert.strictEqual(span.kind, expected.kind, 'SpanKind matches');
      for (const attr in DEFAULT_ATTRIBUTES) {
        assert.strictEqual(
          span.attributes[attr],
          DEFAULT_ATTRIBUTES[attr],
          `${attr} is correct`
        );
      }
      assert.deepEqual(
        span.status,
        expected.status || { code: SpanStatusCode.OK },
        'span status match'
      );
      assert.strictEqual(
        span.parentSpanId,
        expected.parentSpan?.spanContext().spanId,
        'span parent id matches'
      );
    } catch (e) {
      e.message = `At span[${idx}]: ${e.message}`;
      throw e;
    }
  });
};
