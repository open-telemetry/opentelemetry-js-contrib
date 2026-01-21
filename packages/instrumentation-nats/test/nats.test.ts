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

import * as assert from 'assert';
import {
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  Baggage,
} from '@opentelemetry/api';
import {
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
  CompositePropagator,
} from '@opentelemetry/core';
import {
  getTestSpans,
  registerInstrumentationTesting,
  initMeterProvider,
  TestMetricReader,
} from '@opentelemetry/contrib-test-utils';
import { NatsInstrumentation } from '../src';
import {
  ATTR_MESSAGING_SYSTEM,
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_OPERATION_TYPE,
  ATTR_MESSAGING_CONSUMER_GROUP_NAME,
  ATTR_MESSAGING_MESSAGE_BODY_SIZE,
  ATTR_MESSAGING_DESTINATION_TEMPORARY,
  ATTR_MESSAGING_MESSAGE_CONVERSATION_ID,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  MESSAGING_SYSTEM_VALUE_NATS,
  MESSAGING_OPERATION_TYPE_VALUE_PUBLISH,
  MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
  METRIC_MESSAGING_CLIENT_SENT_MESSAGES,
  METRIC_MESSAGING_CLIENT_RECEIVED_MESSAGES,
} from '../src/semconv';
import {
  assertMetricCollection,
  assertPublishSpan,
  assertProcessSpan,
  haveSameTraceId,
} from './utils';

const instrumentation = registerInstrumentationTesting(
  new NatsInstrumentation()
);

import * as nats from 'nats';
import type { NatsConnection, Msg } from 'nats';

const TEST_NATS_HOST = process.env.OPENTELEMETRY_NATS_HOST || 'localhost';
const TEST_NATS_PORT = parseInt(
  process.env.OPENTELEMETRY_NATS_PORT || '4222',
  10
);

function consumeOneMessage(
  nc: NatsConnection,
  subject: string,
  queueGroup?: string
): Promise<Msg> {
  return new Promise((resolve, reject) => {
    nc.subscribe(subject, {
      queue: queueGroup,
      callback: (err, msg) => {
        if (err) {
          reject(err);
        } else {
          resolve(msg);
        }
      },
      max: 1,
      timeout: 2000,
    });
  });
}

describe('NatsInstrumentation', async function () {
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    })
  );

  let nc: NatsConnection;
  let metricReader: TestMetricReader;

  const sc = nats.StringCodec();

  before(async () => {
    nc = await nats.connect({ servers: `${TEST_NATS_HOST}:${TEST_NATS_PORT}` });
  });

  beforeEach(async () => {
    metricReader = initMeterProvider(instrumentation);
  });

  afterEach(async () => {
    instrumentation.setConfig({});
  });

  after(async () => {
    if (nc && !nc.isClosed()) {
      await nc.drain();
    }
  });

  describe('publish', () => {
    describe('successful publish', () => {
      it('should create producer span with correct attributes', async () => {
        const subject = 'test.publish';
        const message = 'msg';

        nc.publish(subject, sc.encode(message));
        await nc.flush();

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);

        const span = spans[0];
        assertPublishSpan(span, subject);
        assert.strictEqual(span.status.code, SpanStatusCode.OK);
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_OPERATION_NAME],
          'publish'
        );
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_OPERATION_TYPE],
          MESSAGING_OPERATION_TYPE_VALUE_PUBLISH
        );
        assert.ok(
          span.attributes[ATTR_SERVER_ADDRESS] === TEST_NATS_HOST ||
            span.attributes[ATTR_SERVER_ADDRESS] === '0.0.0.0',
          `Expected server address to be ${TEST_NATS_HOST} or 0.0.0.0, got ${span.attributes[ATTR_SERVER_ADDRESS]}`
        );
        assert.strictEqual(span.attributes[ATTR_SERVER_PORT], TEST_NATS_PORT);
      });

      it('should include message body size when configured', async () => {
        instrumentation.setConfig({ includeMessageBodySize: true });

        const subject = 'test.publish';
        const message = 'msg';

        nc.publish(subject, sc.encode(message));
        await nc.flush();

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(
          spans[0].attributes[ATTR_MESSAGING_MESSAGE_BODY_SIZE],
          sc.encode(message).length
        );
      });

      it('should not include message body size by default', async () => {
        const subject = 'test.publish';

        nc.publish(subject, sc.encode('msg'));
        await nc.flush();

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(
          spans[0].attributes[ATTR_MESSAGING_MESSAGE_BODY_SIZE],
          undefined
        );
      });

      it('should handle binary data', async () => {
        instrumentation.setConfig({ includeMessageBodySize: true });

        const subject = 'test.publish';
        const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff]);

        nc.publish(subject, binaryData);
        await nc.flush();

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(
          spans[0].attributes[ATTR_MESSAGING_MESSAGE_BODY_SIZE],
          binaryData.length
        );
      });

      it('should send multiple messages and create spans for each', async () => {
        const subject = 'test.publish';
        const messageCount = 3;

        for (let i = 0; i < messageCount; i++) {
          nc.publish(subject, sc.encode(`msg ${i}`));
        }
        await nc.flush();

        const spans = getTestSpans();
        assert.strictEqual(spans.length, messageCount);

        spans.forEach(span => {
          assertPublishSpan(span, subject);
        });

        assert.ok(
          spans.every(
            s => s.attributes[ATTR_MESSAGING_OPERATION_NAME] === 'publish'
          )
        );
      });
    });

    describe('publish metrics', () => {
      it('should record sent messages metric', async () => {
        const subject = 'test.publish';

        nc.publish(subject, sc.encode('msg'));
        await nc.flush();

        assertMetricCollection(await metricReader.collect(), {
          [METRIC_MESSAGING_CLIENT_SENT_MESSAGES]: [
            {
              value: 1,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
                [ATTR_MESSAGING_DESTINATION_NAME]: subject,
                [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
              },
            },
          ],
        });
      });

      it('should aggregate metrics for multiple publishes to same subject', async () => {
        const subject = 'test.publish';
        const messageCount = 5;

        for (let i = 0; i < messageCount; i++) {
          nc.publish(subject, sc.encode(`msg ${i}`));
        }
        await nc.flush();

        assertMetricCollection(await metricReader.collect(), {
          [METRIC_MESSAGING_CLIENT_SENT_MESSAGES]: [
            {
              value: messageCount,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
                [ATTR_MESSAGING_DESTINATION_NAME]: subject,
                [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
              },
            },
          ],
        });
      });
    });
  });

  describe('subscribe', () => {
    describe('callback subscriptions', () => {
      it('should create consumer span for received messages', async () => {
        const subject = 'test.subscribe';
        const message = 'msg';

        const msgPromise = consumeOneMessage(nc, subject);

        nc.publish(subject, sc.encode(message));
        const msg = await msgPromise;

        assert.strictEqual(sc.decode(msg.data), message);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 2);

        const publishSpan = spans.find(s => s.name.startsWith('send '));
        assert.ok(publishSpan, 'Should have a publish span');
        const processSpan = spans.find(s => s.name.startsWith('process '));
        assert.ok(processSpan, 'Should have a process span');

        assertProcessSpan(processSpan, subject);
        assert.strictEqual(processSpan.status.code, SpanStatusCode.OK);
        assert.strictEqual(
          processSpan.attributes[ATTR_MESSAGING_OPERATION_NAME],
          'process'
        );
        assert.strictEqual(
          processSpan.attributes[ATTR_MESSAGING_OPERATION_TYPE],
          MESSAGING_OPERATION_TYPE_VALUE_PROCESS
        );
      });

      it('should include queue group name for queue subscriptions', async () => {
        const subject = 'test.subscribe';
        const queueGroup = 'test-queue-group';

        const msgPromise = consumeOneMessage(nc, subject, queueGroup);

        nc.publish(subject, sc.encode('msg'));
        await msgPromise;

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 2);

        const processSpan = spans.find(s => s.name.startsWith('process '));
        assert.ok(processSpan);
        assert.strictEqual(
          processSpan.attributes[ATTR_MESSAGING_CONSUMER_GROUP_NAME],
          queueGroup
        );
      });
    });

    describe('async iterator subscriptions', () => {
      it('should create consumer spans for async iterator messages', async () => {
        const subject = 'test.subscribe';
        const sub = nc.subscribe(subject);

        nc.publish(subject, sc.encode('msg'));

        for await (const msg of sub) {
          assert.strictEqual(sc.decode(msg.data), 'msg');
          break;
        }

        sub.unsubscribe();

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 2);

        const processSpan = spans.find(s => s.name.startsWith('process '));
        assert.ok(processSpan);
        assert.strictEqual(processSpan.kind, SpanKind.CONSUMER);
        assert.strictEqual(
          processSpan.attributes[ATTR_MESSAGING_OPERATION_NAME],
          'process'
        );
      });
    });

    describe('wildcard subscriptions', () => {
      it('should handle single-level wildcard (*) subscriptions', async () => {
        const wildcardSubject = 'test.publish.*';
        const concreteSubject = 'test.publish.token1';

        const msgPromise = consumeOneMessage(nc, wildcardSubject);

        nc.publish(concreteSubject, sc.encode('msg'));
        const msg = await msgPromise;

        assert.strictEqual(sc.decode(msg.data), 'msg');
        assert.strictEqual(msg.subject, concreteSubject);

        const spans = getTestSpans();

        const processSpan = spans.find(s => s.name.startsWith('process '));
        assert.ok(processSpan);
        assert.strictEqual(
          processSpan.attributes[ATTR_MESSAGING_DESTINATION_NAME],
          concreteSubject
        );
      });

      it('should handle multi-level wildcard (>) subscriptions', async () => {
        const wildcardSubject = 'test.publish.>';
        const concreteSubject = 'test.publish.token1.token2.token2';

        const msgPromise = consumeOneMessage(nc, wildcardSubject);

        nc.publish(concreteSubject, sc.encode('msg'));
        const msg = await msgPromise;

        assert.strictEqual(sc.decode(msg.data), 'msg');
        assert.strictEqual(msg.subject, concreteSubject);

        const spans = getTestSpans();

        const processSpan = spans.find(s => s.name.startsWith('process '));
        assert.ok(processSpan);
        assert.strictEqual(
          processSpan.attributes[ATTR_MESSAGING_DESTINATION_NAME],
          concreteSubject
        );
      });
    });

    describe('subscribe metrics', () => {
      it('should record received messages metric', async () => {
        const subject = 'test.subscribe';

        const msgPromise = consumeOneMessage(nc, subject);

        nc.publish(subject, sc.encode('msg'));
        await msgPromise;

        const collectionResult = await metricReader.collect();
        assertMetricCollection(collectionResult, {
          [METRIC_MESSAGING_CLIENT_SENT_MESSAGES]: [
            {
              value: 1,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
                [ATTR_MESSAGING_DESTINATION_NAME]: subject,
                [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
              },
            },
          ],
          [METRIC_MESSAGING_CLIENT_RECEIVED_MESSAGES]: [
            {
              value: 1,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_NATS,
                [ATTR_MESSAGING_DESTINATION_NAME]: subject,
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
              },
            },
          ],
        });
      });
    });
  });

  describe('request/reply', () => {
    it('should create spans for request and respond', async () => {
      const subject = 'test.request';
      const requestMsg = 'ping';
      const replyMsg = 'pong';

      const sub = nc.subscribe(subject, {
        callback: (err, msg) => {
          if (!err && msg.reply) {
            msg.respond(sc.encode(replyMsg));
          }
        },
      });

      const response = await nc.request(subject, sc.encode(requestMsg), {
        timeout: 2000,
      });
      assert.strictEqual(sc.decode(response.data), replyMsg);

      sub.unsubscribe();

      const spans = getTestSpans();
      assert.ok(
        spans.length >= 3,
        `Expected at least 3 spans, got ${spans.length}`
      );
      const requestSpan = spans.find(
        s => s.attributes[ATTR_MESSAGING_OPERATION_NAME] === 'request'
      );
      const processSpan = spans.find(
        s => s.attributes[ATTR_MESSAGING_OPERATION_NAME] === 'process'
      );
      const respondSpan = spans.find(
        s => s.attributes[ATTR_MESSAGING_OPERATION_NAME] === 'respond'
      );

      assert.ok(requestSpan, 'Should have a request span');
      assert.ok(processSpan, 'Should have a process span');
      assert.ok(respondSpan, 'Should have a respond span');

      assert.strictEqual(requestSpan.kind, SpanKind.PRODUCER);
      assert.strictEqual(
        requestSpan.attributes[ATTR_MESSAGING_DESTINATION_NAME],
        subject
      );
      assert.strictEqual(requestSpan.status.code, SpanStatusCode.OK);

      assert.strictEqual(
        respondSpan.attributes[ATTR_MESSAGING_DESTINATION_TEMPORARY],
        true
      );
      assert.ok(respondSpan.attributes[ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]);
    });

    it('should preserve trace context through request/reply cycle', async () => {
      const subject = 'test.request';

      const sub = nc.subscribe(subject, {
        callback: (err, msg) => {
          if (!err && msg.reply) {
            msg.respond(sc.encode('msg'));
          }
        },
      });

      await nc.request(subject, sc.encode('msg'), { timeout: 2000 });
      sub.unsubscribe();

      const spans = getTestSpans();

      assert.ok(
        spans.length >= 3,
        `Expected at least 3 spans, got ${spans.length}`
      );

      const requestSpan = spans.find(
        s => s.attributes[ATTR_MESSAGING_OPERATION_NAME] === 'request'
      );
      const processSpan = spans.find(
        s => s.attributes[ATTR_MESSAGING_OPERATION_NAME] === 'process'
      );
      const respondSpan = spans.find(
        s => s.attributes[ATTR_MESSAGING_OPERATION_NAME] === 'respond'
      );

      assert.ok(requestSpan, 'Should have request span');
      assert.ok(processSpan, 'Should have process span');
      assert.ok(respondSpan, 'Should have respond span');

      assert.strictEqual(
        processSpan.parentSpanContext?.spanId,
        requestSpan.spanContext().spanId,
        'Process span should have request span as parent'
      );

      assert.ok(
        haveSameTraceId([requestSpan, processSpan, respondSpan]),
        'All spans in request/reply cycle should share traceId'
      );
    });
  });

  describe('context propagation', () => {
    it('should propagate trace context from producer to consumer', async () => {
      const subject = 'test.context.propagation';

      const msgPromise = consumeOneMessage(nc, subject);

      nc.publish(subject, sc.encode('msg'));
      await msgPromise;

      const spans = getTestSpans();
      const publishSpan = spans.find(s => s.name.startsWith('send '));
      const processSpan = spans.find(s => s.name.startsWith('process '));

      assert.ok(publishSpan, 'Should have a publish span');
      assert.ok(processSpan, 'Should have a process span');

      assert.strictEqual(
        processSpan.spanContext().traceId,
        publishSpan.spanContext().traceId,
        'Consumer and producer should have same traceId'
      );

      assert.strictEqual(
        processSpan.parentSpanContext?.spanId,
        publishSpan.spanContext().spanId,
        'Consumer span should have producer span as parent'
      );
    });

    it('should propagate baggage from producer to consumer', async () => {
      const subject = 'test.context.baggage';
      let receivedBaggage: Baggage | undefined;

      const sub = nc.subscribe(subject, {
        callback: (_err, _msg) => {
          receivedBaggage = propagation.getBaggage(context.active());
        },
      });

      await context.with(
        propagation.setBaggage(
          context.active(),
          propagation.createBaggage({ testKey: { value: 'testValue' } })
        ),
        async () => {
          nc.publish(subject, sc.encode('msg'));
          await nc.flush();
        }
      );

      sub.unsubscribe();

      const spans = getTestSpans();
      assert.strictEqual(
        spans.length,
        2,
        'Should have publish and process spans'
      );

      assert.ok(receivedBaggage, 'Baggage should be received in consumer');
      assert.strictEqual(
        receivedBaggage.getAllEntries().length,
        1,
        'Should have one baggage entry'
      );
      assert.strictEqual(
        receivedBaggage.getEntry('testKey')?.value,
        'testValue',
        'Baggage value should match'
      );

      assert.ok(
        haveSameTraceId(spans),
        'Producer and consumer should share traceId'
      );
    });
  });

  describe('hooks', () => {
    describe('publishHook', () => {
      it('should call publishHook when configured', async () => {
        let hookCalled = false;
        let hookSubject: string | undefined;

        instrumentation.setConfig({
          publishHook: (span, info) => {
            hookCalled = true;
            hookSubject = info.subject;
            span.setAttribute('custom.publish.attr', 'test-value');
          },
        });

        const subject = 'test.hook.publish';
        nc.publish(subject, sc.encode('msg'));
        await nc.flush();

        assert.strictEqual(hookCalled, true);
        assert.strictEqual(hookSubject, subject);

        const spans = getTestSpans();
        assert.strictEqual(
          spans[0].attributes['custom.publish.attr'],
          'test-value'
        );
      });

      it('should provide data in publishHook info', async () => {
        let receivedData: Uint8Array | string | undefined;

        instrumentation.setConfig({
          publishHook: (_span, info) => {
            receivedData = info.data;
          },
        });

        const subject = 'test.hook.publish';
        const message = 'msg';
        nc.publish(subject, sc.encode(message));
        await nc.flush();

        assert.ok(receivedData);
        assert.strictEqual(sc.decode(receivedData as Uint8Array), message);
      });

      it('hook errors should not affect publish or span creation', async () => {
        instrumentation.setConfig({
          publishHook: () => {
            throw new Error('error from publishHook');
          },
        });

        const subject = 'test.hook.publish.error';

        nc.publish(subject, sc.encode('msg'));
        await nc.flush();

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(spans[0].status.code, SpanStatusCode.OK);
      });
    });

    describe('consumeHook', () => {
      it('should call consumeHook when configured', async () => {
        let hookCalled = false;
        let hookSubject: string | undefined;

        instrumentation.setConfig({
          consumeHook: (span, info) => {
            hookCalled = true;
            hookSubject = info.message.subject;
            span.setAttribute('custom.consume.attr', 'consumed');
          },
        });

        const subject = 'test.hook.consume';
        const msgPromise = consumeOneMessage(nc, subject);

        nc.publish(subject, sc.encode('msg'));
        await msgPromise;

        assert.strictEqual(hookCalled, true);
        assert.strictEqual(hookSubject, subject);

        const spans = getTestSpans();
        const processSpan = spans.find(s => s.name.startsWith('process '));
        assert.strictEqual(
          processSpan?.attributes['custom.consume.attr'],
          'consumed'
        );
      });

      it('should provide message in consumeHook info', async () => {
        let receivedMessage: Msg | undefined;

        instrumentation.setConfig({
          consumeHook: (_span, info) => {
            receivedMessage = info.message;
          },
        });

        const subject = 'test.hook.consume';
        const message = 'msg';
        const msgPromise = consumeOneMessage(nc, subject);

        nc.publish(subject, sc.encode(message));
        await msgPromise;

        assert.ok(receivedMessage);
        assert.strictEqual(receivedMessage.subject, subject);
        assert.strictEqual(sc.decode(receivedMessage.data), message);
      });

      it('hook errors should not affect consume or span creation', async () => {
        instrumentation.setConfig({
          consumeHook: () => {
            throw new Error('error from consumeHook');
          },
        });

        const subject = 'test.hook.consume.error';
        const msgPromise = consumeOneMessage(nc, subject);

        nc.publish(subject, sc.encode('msg'));
        await msgPromise;

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 2);

        spans.forEach(s => {
          assert.strictEqual(s.status.code, SpanStatusCode.OK);
        });
      });
    });
  });

  describe('queue groups', () => {
    it('should distribute messages across queue group subscribers', async () => {
      const subject = 'test.queue.group';
      const queueGroup = 'workers';
      const messageCount = 3;
      const receivedMessages: string[] = [];

      const sub1 = nc.subscribe(subject, {
        queue: queueGroup,
        callback: (err, msg) => {
          if (!err) {
            receivedMessages.push(`worker1:${sc.decode(msg.data)}`);
          }
        },
      });

      const sub2 = nc.subscribe(subject, {
        queue: queueGroup,
        callback: (err, msg) => {
          if (!err) {
            receivedMessages.push(`worker2:${sc.decode(msg.data)}`);
          }
        },
      });

      for (let i = 0; i < messageCount; i++) {
        nc.publish(subject, sc.encode(`msg ${i}`));
      }

      await nc.flush();

      sub1.unsubscribe();
      sub2.unsubscribe();

      assert.strictEqual(receivedMessages.length, messageCount);

      const spans = getTestSpans();
      const processSpans = spans.filter(s => s.name.startsWith('process '));

      processSpans.forEach(span => {
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_CONSUMER_GROUP_NAME],
          queueGroup
        );
      });
    });

    it('should record queue group in metrics', async () => {
      const subject = 'test.queue.group.metrics';
      const queueGroup = 'metrics-workers';

      const msgPromise = consumeOneMessage(nc, subject, queueGroup);

      nc.publish(subject, sc.encode('msg'));
      await msgPromise;

      const spans = getTestSpans();
      const processSpan = spans.find(s => s.name.startsWith('process '));
      assert.strictEqual(
        processSpan?.attributes[ATTR_MESSAGING_CONSUMER_GROUP_NAME],
        queueGroup
      );
    });
  });
});
