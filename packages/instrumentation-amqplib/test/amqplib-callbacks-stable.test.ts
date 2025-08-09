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
import 'mocha';
import { expect } from 'expect';
import { AmqplibInstrumentation } from '../src';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';

const instrumentation = registerInstrumentationTesting(
  new AmqplibInstrumentation()
);

import * as amqpCallback from 'amqplib/callback_api';
import {
  ATTR_NETWORK_PEER_ADDRESS,
  ATTR_NETWORK_PEER_PORT,
  ATTR_NETWORK_PROTOCOL_NAME,
  ATTR_NETWORK_PROTOCOL_VERSION,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import { Baggage, context, propagation, SpanKind } from '@opentelemetry/api';
import { asyncConfirmSend, asyncConsume, shouldTest } from './utils';
import { rabbitMqUrl, TEST_RABBITMQ_HOST, TEST_RABBITMQ_PORT } from './config';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { SemconvStability } from '@opentelemetry/instrumentation';
import {
  ATTR_MESSAGING_SYSTEM,
  ATTR_MESSAGING_MESSAGE_BODY_SIZE,
  ATTR_MESSAGING_OPERATION_TYPE,
  MESSAGING_OPERATION_TYPE_VALUE_SEND,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY,
  MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
  ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG,
} from '@opentelemetry/semantic-conventions/incubating';

const msgPayload = 'payload from test';
const queueName = 'queue-name-from-unittest';

describe('amqplib instrumentation callback model - stable semconv', () => {
  let conn: amqpCallback.Connection;
  before(() => {
    propagation.setGlobalPropagator(
      new CompositePropagator({
        propagators: [
          new W3CBaggagePropagator(),
          new W3CTraceContextPropagator(),
        ],
      })
    );
  });
  before(function (done) {
    instrumentation['_semconvStability'] = SemconvStability.STABLE;
    if (!shouldTest) {
      this.skip();
    } else {
      amqpCallback.connect(rabbitMqUrl, (err, connection) => {
        conn = connection;
        done(err);
      });
    }
  });
  after(done => {
    instrumentation['_semconvStability'] = SemconvStability.OLD;
    if (!shouldTest) {
      done();
    } else {
      conn.close(() => done());
    }
  });

  describe('channel', () => {
    let channel: amqpCallback.Channel;
    beforeEach(done => {
      conn.createChannel(
        context.bind(context.active(), (err, c) => {
          channel = c;
          // install an error handler, otherwise when we have tests that create error on the channel,
          // it throws and crash process
          channel.on('error', () => {});
          channel.assertQueue(
            queueName,
            { durable: false },
            context.bind(context.active(), (err, ok) => {
              channel.purgeQueue(
                queueName,
                context.bind(context.active(), (err, ok) => {
                  done();
                })
              );
            })
          );
        })
      );
    });

    afterEach(done => {
      try {
        channel.close(err => {
          done();
        });
      } catch {}
    });

    it('simple publish and consume from queue callback', done => {
      const hadSpaceInBuffer = channel.sendToQueue(
        queueName,
        Buffer.from(msgPayload)
      );
      expect(hadSpaceInBuffer).toBeTruthy();

      asyncConsume(
        channel,
        queueName,
        [msg => expect(msg.content.toString()).toEqual(msgPayload)],
        {
          noAck: true,
        }
      ).then(() => {
        const [publishSpan, consumeSpan] = getTestSpans();

        // assert publish span
        expect(publishSpan.kind).toEqual(SpanKind.PRODUCER);
        expect(publishSpan.name).toMatch(`publish ${queueName}`);
        expect(publishSpan.attributes).toEqual({
          [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
          [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: msgPayload.length,
          [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_SEND,
          [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
          [ATTR_MESSAGING_DESTINATION_NAME]: queueName,
          [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: queueName,
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
          [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
          [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
          [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
        });

        // assert consume span
        expect(consumeSpan.kind).toEqual(SpanKind.CONSUMER);
        expect(consumeSpan.name).toMatch(`consume ${queueName}`);
        expect(consumeSpan.attributes).toEqual({
          [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
          [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: msgPayload.length,
          [ATTR_MESSAGING_OPERATION_TYPE]:
            MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
          [ATTR_MESSAGING_OPERATION_NAME]: 'consume',
          [ATTR_MESSAGING_DESTINATION_NAME]: queueName,
          [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: queueName,
          [ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG]: 1,
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
          [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
          [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
          [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
        });

        // assert context propagation
        expect(consumeSpan.spanContext().traceId).toEqual(
          publishSpan.spanContext().traceId
        );
        expect(consumeSpan.parentSpanContext?.spanId).toEqual(
          publishSpan.spanContext().spanId
        );

        done();
      });
    });

    it('baggage is available while consuming', done => {
      const baggageContext = propagation.setBaggage(
        context.active(),
        propagation.createBaggage({
          key1: { value: 'value1' },
        })
      );
      context.with(baggageContext, () => {
        channel.sendToQueue(queueName, Buffer.from(msgPayload));
        let extractedBaggage: Baggage | undefined;
        asyncConsume(
          channel,
          queueName,
          [
            msg => {
              extractedBaggage = propagation.getActiveBaggage();
            },
          ],
          {
            noAck: true,
          }
        ).then(() => {
          expect(extractedBaggage).toBeDefined();
          expect(extractedBaggage!.getEntry('key1')).toBeDefined();
          done();
        });
      });
    });

    it('end span with ack sync', done => {
      channel.sendToQueue(queueName, Buffer.from(msgPayload));

      asyncConsume(channel, queueName, [msg => channel.ack(msg)]).then(() => {
        // assert consumed message span has ended
        expect(getTestSpans().length).toBe(2);
        done();
      });
    });

    it('end span with ack async', done => {
      channel.sendToQueue(queueName, Buffer.from(msgPayload));

      asyncConsume(channel, queueName, [
        msg =>
          setTimeout(() => {
            channel.ack(msg);
            expect(getTestSpans().length).toBe(2);
            done();
          }, 1),
      ]);
    });
  });

  describe('confirm channel', () => {
    let confirmChannel: amqpCallback.ConfirmChannel;
    beforeEach(done => {
      conn.createConfirmChannel(
        context.bind(context.active(), (err, c) => {
          confirmChannel = c;
          // install an error handler, otherwise when we have tests that create error on the channel,
          // it throws and crash process
          confirmChannel.on('error', () => {});
          confirmChannel.assertQueue(
            queueName,
            { durable: false },
            context.bind(context.active(), (err, ok) => {
              confirmChannel.purgeQueue(
                queueName,
                context.bind(context.active(), (err, ok) => {
                  done();
                })
              );
            })
          );
        })
      );
    });

    afterEach(done => {
      try {
        confirmChannel.close(err => {
          done();
        });
      } catch {}
    });

    it('simple publish and consume from queue callback', done => {
      asyncConfirmSend(confirmChannel, queueName, msgPayload).then(() => {
        asyncConsume(
          confirmChannel,
          queueName,
          [msg => expect(msg.content.toString()).toEqual(msgPayload)],
          {
            noAck: true,
          }
        ).then(() => {
          const [publishSpan, consumeSpan] = getTestSpans();

          // assert publish span
          expect(publishSpan.kind).toEqual(SpanKind.PRODUCER);
          expect(publishSpan.name).toEqual(`publish ${queueName}`);
          expect(publishSpan.attributes).toEqual({
            [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: msgPayload.length,
            [ATTR_MESSAGING_OPERATION_TYPE]:
              MESSAGING_OPERATION_TYPE_VALUE_SEND,
            [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
            [ATTR_MESSAGING_DESTINATION_NAME]: queueName,
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: queueName,
            [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
            [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
            [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
            [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
          });

          // assert consume span
          expect(consumeSpan.kind).toEqual(SpanKind.CONSUMER);
          expect(consumeSpan.name).toEqual(`consume ${queueName}`);
          expect(consumeSpan.attributes).toEqual({
            [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: msgPayload.length,
            [ATTR_MESSAGING_OPERATION_TYPE]:
              MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
            [ATTR_MESSAGING_OPERATION_NAME]: 'consume',
            [ATTR_MESSAGING_DESTINATION_NAME]: queueName,
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: queueName,
            [ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG]: 1,
            [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
            [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
            [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
            [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
          });

          // assert context propagation
          expect(consumeSpan.spanContext().traceId).toEqual(
            publishSpan.spanContext().traceId
          );
          expect(consumeSpan.parentSpanContext?.spanId).toEqual(
            publishSpan.spanContext().spanId
          );

          done();
        });
      });
    });

    it('end span with ack sync', done => {
      asyncConfirmSend(confirmChannel, queueName, msgPayload).then(() => {
        asyncConsume(confirmChannel, queueName, [
          msg => confirmChannel.ack(msg),
        ]).then(() => {
          // assert consumed message span has ended
          expect(getTestSpans().length).toBe(2);
          done();
        });
      });
    });

    it('end span with ack async', done => {
      asyncConfirmSend(confirmChannel, queueName, msgPayload).then(() => {
        asyncConsume(confirmChannel, queueName, [
          msg =>
            setTimeout(() => {
              confirmChannel.ack(msg);
              expect(getTestSpans().length).toBe(2);
              done();
            }, 1),
        ]);
      });
    });
  });

  describe('channel with links config', () => {
    let channel: amqpCallback.Channel;
    beforeEach(done => {
      instrumentation.setConfig({
        useLinksForConsume: true,
      });
      conn.createChannel(
        context.bind(context.active(), (err, c) => {
          channel = c;
          // install an error handler, otherwise when we have tests that create error on the channel,
          // it throws and crash process
          channel.on('error', () => {});
          channel.assertQueue(
            queueName,
            { durable: false },
            context.bind(context.active(), (err, ok) => {
              channel.purgeQueue(
                queueName,
                context.bind(context.active(), (err, ok) => {
                  done();
                })
              );
            })
          );
        })
      );
    });

    afterEach(done => {
      try {
        channel.close(err => {
          done();
        });
      } catch {}
    });

    it('simple publish and consume from queue callback', done => {
      const hadSpaceInBuffer = channel.sendToQueue(
        queueName,
        Buffer.from(msgPayload)
      );
      expect(hadSpaceInBuffer).toBeTruthy();

      asyncConsume(
        channel,
        queueName,
        [msg => expect(msg.content.toString()).toEqual(msgPayload)],
        {
          noAck: true,
        }
      ).then(() => {
        const [publishSpan, consumeSpan] = getTestSpans();

        // assert publish span
        expect(publishSpan.kind).toEqual(SpanKind.PRODUCER);
        expect(publishSpan.name).toEqual(`publish ${queueName}`);
        expect(publishSpan.attributes).toEqual({
          [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
          [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: msgPayload.length,
          [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_SEND,
          [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
          [ATTR_MESSAGING_DESTINATION_NAME]: queueName,
          [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: queueName,
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
          [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
          [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
          [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
        });

        // assert consume span
        expect(consumeSpan.kind).toEqual(SpanKind.CONSUMER);
        expect(consumeSpan.name).toEqual(`consume ${queueName}`);
        expect(consumeSpan.attributes).toEqual({
          [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
          [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: msgPayload.length,
          [ATTR_MESSAGING_OPERATION_TYPE]:
            MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
          [ATTR_MESSAGING_OPERATION_NAME]: 'consume',
          [ATTR_MESSAGING_DESTINATION_NAME]: queueName,
          [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: queueName,
          [ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG]: 1,
          [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
          [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
          [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
          [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
          [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
          [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
        });

        // new trace should be created
        expect(consumeSpan.spanContext().traceId).not.toEqual(
          publishSpan.spanContext().traceId
        );
        expect(consumeSpan.parentSpanContext?.spanId).toBeUndefined();

        // link back to publish span
        expect(consumeSpan.links.length).toBe(1);
        expect(consumeSpan.links[0].context.traceId).toEqual(
          publishSpan.spanContext().traceId
        );
        expect(consumeSpan.links[0].context.spanId).toEqual(
          publishSpan.spanContext().spanId
        );

        done();
      });
    });
  });

  describe('confirm channel with links config', () => {
    let confirmChannel: amqpCallback.ConfirmChannel;
    beforeEach(done => {
      instrumentation.setConfig({
        useLinksForConsume: true,
      });
      conn.createConfirmChannel(
        context.bind(context.active(), (err, c) => {
          confirmChannel = c;
          // install an error handler, otherwise when we have tests that create error on the channel,
          // it throws and crash process
          confirmChannel.on('error', () => {});
          confirmChannel.assertQueue(
            queueName,
            { durable: false },
            context.bind(context.active(), (err, ok) => {
              confirmChannel.purgeQueue(
                queueName,
                context.bind(context.active(), (err, ok) => {
                  done();
                })
              );
            })
          );
        })
      );
    });

    afterEach(done => {
      try {
        confirmChannel.close(err => {
          done();
        });
      } catch {}
    });

    it('simple publish and consume from queue callback', done => {
      asyncConfirmSend(confirmChannel, queueName, msgPayload).then(() => {
        asyncConsume(
          confirmChannel,
          queueName,
          [msg => expect(msg.content.toString()).toEqual(msgPayload)],
          {
            noAck: true,
          }
        ).then(() => {
          const [publishSpan, consumeSpan] = getTestSpans();

          // assert publish span
          expect(publishSpan.kind).toEqual(SpanKind.PRODUCER);
          expect(publishSpan.name).toEqual(`publish ${queueName}`);
          expect(publishSpan.attributes).toEqual({
            [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: msgPayload.length,
            [ATTR_MESSAGING_OPERATION_TYPE]:
              MESSAGING_OPERATION_TYPE_VALUE_SEND,
            [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
            [ATTR_MESSAGING_DESTINATION_NAME]: queueName,
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: queueName,
            [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
            [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
            [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
            [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
          });

          // assert consume span
          expect(consumeSpan.kind).toEqual(SpanKind.CONSUMER);
          expect(consumeSpan.name).toEqual(`consume ${queueName}`);
          expect(consumeSpan.attributes).toEqual({
            [ATTR_MESSAGING_SYSTEM]: 'rabbitmq',
            [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: msgPayload.length,
            [ATTR_MESSAGING_OPERATION_TYPE]:
              MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
            [ATTR_MESSAGING_OPERATION_NAME]: 'consume',
            [ATTR_MESSAGING_DESTINATION_NAME]: queueName,
            [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: queueName,
            [ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG]: 1,
            [ATTR_NETWORK_PROTOCOL_NAME]: 'AMQP',
            [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1',
            [ATTR_NETWORK_PEER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_NETWORK_PEER_PORT]: TEST_RABBITMQ_PORT,
            [ATTR_SERVER_ADDRESS]: TEST_RABBITMQ_HOST,
            [ATTR_SERVER_PORT]: TEST_RABBITMQ_PORT,
          });

          // new trace should be created
          expect(consumeSpan.spanContext().traceId).not.toEqual(
            publishSpan.spanContext().traceId
          );
          expect(consumeSpan.parentSpanContext?.spanId).toBeUndefined();

          // link back to publish span
          expect(consumeSpan.links.length).toBe(1);
          expect(consumeSpan.links[0].context.traceId).toEqual(
            publishSpan.spanContext().traceId
          );
          expect(consumeSpan.links[0].context.spanId).toEqual(
            publishSpan.spanContext().spanId
          );

          done();
        });
      });
    });
  });
});
