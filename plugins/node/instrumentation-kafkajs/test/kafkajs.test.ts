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
import { KafkaJsInstrumentation, KafkaJsInstrumentationConfig } from '../src';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  propagation,
  context,
  SpanKind,
  SpanStatusCode,
  Baggage,
} from '@opentelemetry/api';
import {
  MESSAGINGDESTINATIONKINDVALUES_TOPIC,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_MESSAGING_DESTINATION_KIND,
  SEMATTRS_MESSAGING_DESTINATION,
  SEMATTRS_MESSAGING_OPERATION,
} from '@opentelemetry/semantic-conventions';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
import { W3CBaggagePropagator, CompositePropagator } from '@opentelemetry/core';

const instrumentation = registerInstrumentationTesting(
  new KafkaJsInstrumentation()
);

import * as kafkajs from 'kafkajs';
import {
  Kafka,
  ProducerRecord,
  RecordMetadata,
  Producer,
  ProducerBatch,
  Message,
  Consumer,
  ConsumerRunConfig,
  EachBatchPayload,
  EachMessagePayload,
  KafkaMessage,
} from 'kafkajs';
import { DummyPropagation } from './DummyPropagation';

describe('instrumentation-kafkajs', () => {
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new DummyPropagation(), new W3CBaggagePropagator()],
    })
  );

  const kafka = new Kafka({
    clientId: 'unit-tests',
    brokers: ['testing_mock_host:1234'],
  });

  let producer: Producer;
  let messagesSent: Message[] = [];

  const patchProducerSend = (cb: () => Promise<RecordMetadata[]>) => {
    const origProducerFactory = kafkajs.Kafka.prototype.producer;
    kafkajs.Kafka.prototype.producer = function (...args): Producer {
      const producer = origProducerFactory.apply(this, args);

      producer.send = function (record: ProducerRecord) {
        messagesSent.push(...record.messages);
        return cb();
      };

      producer.sendBatch = function (batch: ProducerBatch) {
        batch.topicMessages?.forEach(topicMessages =>
          messagesSent.push(...topicMessages.messages)
        );
        return cb();
      };

      return producer;
    };
  };

  let consumer: Consumer;
  let runConfig: ConsumerRunConfig | undefined;

  const storeRunConfig = () => {
    const origConsumerFactory = kafkajs.Kafka.prototype.consumer;
    kafkajs.Kafka.prototype.consumer = function (...args): Consumer {
      const consumer: Consumer = origConsumerFactory.apply(this, args);
      consumer.run = function (config?: ConsumerRunConfig): Promise<void> {
        runConfig = config;
        return Promise.resolve();
      };
      return consumer;
    };
  };

  beforeEach(() => {
    messagesSent = [];
  });

  describe('producer', () => {
    const expectKafkaHeadersToMatchSpanContext = (
      kafkaMessage: Message,
      span: ReadableSpan
    ) => {
      assert.strictEqual(
        kafkaMessage.headers?.[DummyPropagation.TRACE_CONTEXT_KEY],
        span.spanContext().traceId
      );
      assert.strictEqual(
        kafkaMessage.headers?.[DummyPropagation.SPAN_CONTEXT_KEY],
        span.spanContext().spanId
      );
    };

    describe('successful send', () => {
      beforeEach(async () => {
        patchProducerSend(async (): Promise<RecordMetadata[]> => {
          return [
            {
              topicName: 'topic-name-1',
              partition: 0,
              errorCode: 123,
              offset: '18',
              timestamp: '123456',
            },
          ];
        });
        instrumentation.disable();
        instrumentation.enable();
        producer = kafka.producer();
      });

      it('simple send create span with right attributes, pass return value correctly and propagate context', async () => {
        const res: RecordMetadata[] = await producer.send({
          topic: 'topic-name-1',
          messages: [
            {
              value: 'testing message content',
            },
          ],
        });

        assert.strictEqual(res.length, 1);
        assert.strictEqual(res[0].topicName, 'topic-name-1');

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.kind, SpanKind.PRODUCER);
        assert.strictEqual(span.name, 'topic-name-1');
        assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
        assert.strictEqual(span.attributes[SEMATTRS_MESSAGING_SYSTEM], 'kafka');
        assert.strictEqual(
          span.attributes[SEMATTRS_MESSAGING_DESTINATION_KIND],
          MESSAGINGDESTINATIONKINDVALUES_TOPIC
        );
        assert.strictEqual(
          span.attributes[SEMATTRS_MESSAGING_DESTINATION],
          'topic-name-1'
        );

        assert.strictEqual(messagesSent.length, 1);
        expectKafkaHeadersToMatchSpanContext(
          messagesSent[0],
          span as ReadableSpan
        );
      });

      it('send two messages', async () => {
        await producer.send({
          topic: 'topic-name-1',
          messages: [
            {
              value: 'message1',
            },
            {
              value: 'message2',
            },
          ],
        });

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 2);
        assert.strictEqual(spans[0].name, 'topic-name-1');
        assert.strictEqual(spans[1].name, 'topic-name-1');

        assert.strictEqual(messagesSent.length, 2);
        expectKafkaHeadersToMatchSpanContext(
          messagesSent[0],
          spans[0] as ReadableSpan
        );
        expectKafkaHeadersToMatchSpanContext(
          messagesSent[1],
          spans[1] as ReadableSpan
        );
      });

      it('send batch', async () => {
        await producer.sendBatch({
          topicMessages: [
            {
              topic: 'topic-name-1',
              messages: [
                {
                  value: 'message1-1',
                },
                {
                  value: 'message1-2',
                },
              ],
            },
            {
              topic: 'topic-name-2',
              messages: [
                {
                  value: 'message2-1',
                },
              ],
            },
          ],
        });

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 3);
        assert.strictEqual(spans[0].name, 'topic-name-1');
        assert.strictEqual(spans[1].name, 'topic-name-1');
        assert.strictEqual(spans[2].name, 'topic-name-2');

        assert.strictEqual(messagesSent.length, 3);
        for (let i = 0; i < 3; i++) {
          expectKafkaHeadersToMatchSpanContext(
            messagesSent[i],
            spans[i] as ReadableSpan
          );
        }
      });
    });

    describe('failed send', () => {
      beforeEach(async () => {
        patchProducerSend((): Promise<RecordMetadata[]> => {
          return Promise.reject(
            new Error('error thrown from kafka client send')
          );
        });
        instrumentation.disable();
        instrumentation.enable();
        producer = kafka.producer();
      });

      it('error in send create failed span', async () => {
        try {
          await producer.send({
            topic: 'topic-name-1',
            messages: [
              {
                value: 'testing message content',
              },
            ],
          });
        } catch (err) {}

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
        assert.strictEqual(
          span.status.message,
          'error thrown from kafka client send'
        );
      });

      it('error in send with multiple messages create failed spans', async () => {
        try {
          await producer.send({
            topic: 'topic-name-1',
            messages: [
              {
                value: 'testing message content 1',
              },
              {
                value: 'testing message content 2',
              },
            ],
          });
        } catch (err) {}

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 2);
        spans.forEach(span => {
          assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
          assert.strictEqual(
            span.status.message,
            'error thrown from kafka client send'
          );
        });
      });

      it('error in sendBatch should set error to all spans', async () => {
        try {
          await producer.sendBatch({
            topicMessages: [
              {
                topic: 'topic-name-1',
                messages: [
                  {
                    value: 'message1-1',
                  },
                  {
                    value: 'message1-2',
                  },
                ],
              },
              {
                topic: 'topic-name-2',
                messages: [
                  {
                    value: 'message2-1',
                  },
                ],
              },
            ],
          });
        } catch (err) {}

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 3);
        spans.forEach(span => {
          assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
          assert.strictEqual(
            span.status.message,
            'error thrown from kafka client send'
          );
        });
      });
    });

    describe('producer hook successful', () => {
      beforeEach(async () => {
        patchProducerSend(async (): Promise<RecordMetadata[]> => []);

        const config: KafkaJsInstrumentationConfig = {
          producerHook: (span, info) => {
            span.setAttribute(
              'attribute-from-hook',
              info.message.value as string
            );
          },
        };
        instrumentation.disable();
        instrumentation.setConfig(config);
        instrumentation.enable();
        producer = kafka.producer();
      });

      it('producer hook add span attribute with value from message', async () => {
        await producer.send({
          topic: 'topic-name-1',
          messages: [
            {
              value: 'testing message content',
            },
          ],
        });

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(
          span.attributes['attribute-from-hook'],
          'testing message content'
        );
      });
    });

    describe('producer hook throw, should still create span', () => {
      beforeEach(async () => {
        patchProducerSend(async (): Promise<RecordMetadata[]> => []);

        const config: KafkaJsInstrumentationConfig = {
          producerHook: (_span, _info) => {
            throw new Error('error thrown from producer hook');
          },
        };
        instrumentation.disable();
        instrumentation.setConfig(config);
        instrumentation.enable();
        producer = kafka.producer();
      });

      it('producer hook add span attribute with value from message', async () => {
        await producer.send({
          topic: 'topic-name-1',
          messages: [
            {
              value: 'testing message content',
            },
          ],
        });

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
      });
    });
  });

  describe('consumer', () => {
    const createKafkaMessage = (offset: string): KafkaMessage => {
      return {
        key: Buffer.from('message-key', 'utf8'),
        value: Buffer.from('message content', 'utf8'),
        timestamp: '1234',
        size: 10,
        attributes: 1,
        offset: offset,
      };
    };

    const createEachMessagePayload = (): EachMessagePayload => {
      return {
        topic: 'topic-name-1',
        partition: 0,
        message: createKafkaMessage('123'),
        heartbeat: async () => {},
        pause: () => () => {},
      };
    };

    const createEachBatchPayload = (): EachBatchPayload => {
      return {
        batch: {
          topic: 'topic-name-1',
          partition: 1234,
          highWatermark: '4567',
          messages: [createKafkaMessage('124'), createKafkaMessage('125')],
        },
      } as EachBatchPayload;
    };

    beforeEach(() => {
      storeRunConfig();
    });

    describe('successful eachMessage', () => {
      beforeEach(async () => {
        instrumentation.disable();
        instrumentation.enable();
        consumer = kafka.consumer({
          groupId: 'testing-group-id',
        });
      });

      it('consume eachMessage create span with expected attributes', async () => {
        consumer.run({
          eachMessage: async (
            _payload: EachMessagePayload
          ): Promise<void> => {},
        });
        const payload: EachMessagePayload = createEachMessagePayload();
        await runConfig?.eachMessage!(payload);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.name, 'topic-name-1');
        assert.strictEqual(span.parentSpanId, undefined);
        assert.strictEqual(span.kind, SpanKind.CONSUMER);
        assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
        assert.strictEqual(span.attributes[SEMATTRS_MESSAGING_SYSTEM], 'kafka');
        assert.strictEqual(
          span.attributes[SEMATTRS_MESSAGING_DESTINATION_KIND],
          MESSAGINGDESTINATIONKINDVALUES_TOPIC
        );
        assert.strictEqual(
          span.attributes[SEMATTRS_MESSAGING_DESTINATION],
          'topic-name-1'
        );
        assert.strictEqual(
          span.attributes[SEMATTRS_MESSAGING_OPERATION],
          'process'
        );
      });

      it('consumer eachMessage with non promise return value', async () => {
        consumer.run({
          // the usecase of kafkajs callback not returning promise
          // is not typescript valid, but it might (and is) implemented in real life (nestjs)
          // and does not break the library.
          eachMessage: async (_payload: EachMessagePayload) => {},
        });
        const payload: EachMessagePayload = createEachMessagePayload();
        await runConfig?.eachMessage!(payload);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
      });
    });

    describe('successful consumer hook', () => {
      beforeEach(async () => {
        const config: KafkaJsInstrumentationConfig = {
          consumerHook: (span, info) => {
            span.setAttribute(
              'attribute key from hook',
              info.message.value!.toString()
            );
          },
        };
        instrumentation.disable();
        instrumentation.setConfig(config);
        instrumentation.enable();
        consumer = kafka.consumer({
          groupId: 'testing-group-id',
        });
        consumer.run({
          eachMessage: async (
            _payload: EachMessagePayload
          ): Promise<void> => {},
        });
      });

      it('consume hook adds attribute to span', async () => {
        const payload: EachMessagePayload = createEachMessagePayload();
        await runConfig?.eachMessage!(payload);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(
          span.attributes['attribute key from hook'],
          payload.message.value?.toString()
        );
      });
    });

    describe('throwing consumer hook', () => {
      beforeEach(async () => {
        const config: KafkaJsInstrumentationConfig = {
          consumerHook: (_span, _info) => {
            throw new Error('error thrown from consumer hook');
          },
        };
        instrumentation.disable();
        instrumentation.setConfig(config);
        instrumentation.enable();
        consumer = kafka.consumer({
          groupId: 'testing-group-id',
        });
        consumer.run({
          eachMessage: async (
            _payload: EachMessagePayload
          ): Promise<void> => {},
        });
      });

      it('consume hook adds attribute to span', async () => {
        const payload: EachMessagePayload = createEachMessagePayload();
        await runConfig?.eachMessage!(payload);

        const spans = getTestSpans();
        // span should still be created
        assert.strictEqual(spans.length, 1);
      });
    });

    describe('eachMessage throws', () => {
      beforeEach(async () => {
        instrumentation.disable();
        instrumentation.enable();
        consumer = kafka.consumer({
          groupId: 'testing-group-id',
        });
      });

      it('Error message written in the span status', async () => {
        const errorToThrow = new Error(
          'error thrown from eachMessage callback'
        );
        consumer.run({
          eachMessage: async (_payload: EachMessagePayload): Promise<void> => {
            throw errorToThrow;
          },
        });

        const payload: EachMessagePayload = createEachMessagePayload();
        let exception;
        try {
          await runConfig?.eachMessage!(payload);
        } catch (e) {
          exception = e;
        }
        assert.deepStrictEqual(exception, errorToThrow);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
        assert.strictEqual(
          span.status.message,
          'error thrown from eachMessage callback'
        );
      });

      it('throwing object with no message', async () => {
        const objectToThrow = {
          nonMessageProperty: 'the thrown object has no `message` property',
        };
        consumer.run({
          eachMessage: async (_payload: EachMessagePayload): Promise<void> => {
            throw objectToThrow;
          },
        });

        const payload: EachMessagePayload = createEachMessagePayload();
        let exception;
        try {
          await runConfig?.eachMessage!(payload);
        } catch (e) {
          exception = e;
        }
        assert.deepStrictEqual(exception, objectToThrow);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
        assert.strictEqual(span.status.message, undefined);
      });

      it('throwing non object', async () => {
        consumer.run({
          eachMessage: async (_payload: EachMessagePayload): Promise<void> => {
            throw undefined;
          },
        });

        const payload: EachMessagePayload = createEachMessagePayload();
        let exception = null;
        try {
          await runConfig?.eachMessage!(payload);
        } catch (e) {
          exception = e;
        }
        assert.strictEqual(exception, undefined);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
        assert.strictEqual(span.status.message, undefined);
      });
    });

    describe('successful eachBatch', () => {
      beforeEach(async () => {
        instrumentation.disable();
        instrumentation.enable();
        consumer = kafka.consumer({
          groupId: 'testing-group-id',
        });
      });

      it('consume eachBatch create span with expected attributes', async () => {
        consumer.run({
          eachBatch: async (_payload: EachBatchPayload): Promise<void> => {},
        });
        const payload: EachBatchPayload = createEachBatchPayload();
        await runConfig?.eachBatch!(payload);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 3);
        spans.forEach(span => {
          assert.strictEqual(span.name, 'topic-name-1');
          assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
          assert.strictEqual(
            span.attributes[SEMATTRS_MESSAGING_SYSTEM],
            'kafka'
          );
          assert.strictEqual(
            span.attributes[SEMATTRS_MESSAGING_DESTINATION_KIND],
            MESSAGINGDESTINATIONKINDVALUES_TOPIC
          );
          assert.strictEqual(
            span.attributes[SEMATTRS_MESSAGING_DESTINATION],
            'topic-name-1'
          );
        });

        const [recvSpan, msg1Span, msg2Span] = spans;

        assert.strictEqual(recvSpan.parentSpanId, undefined);
        assert.strictEqual(
          recvSpan.attributes[SEMATTRS_MESSAGING_OPERATION],
          'receive'
        );

        assert.strictEqual(
          msg1Span.parentSpanId,
          recvSpan.spanContext().spanId
        );
        assert.strictEqual(
          msg1Span.attributes[SEMATTRS_MESSAGING_OPERATION],
          'process'
        );

        assert.strictEqual(
          msg2Span.parentSpanId,
          recvSpan.spanContext().spanId
        );
        assert.strictEqual(
          msg2Span.attributes[SEMATTRS_MESSAGING_OPERATION],
          'process'
        );
      });

      it('consumer eachBatch with non promise return value', async () => {
        consumer.run({
          // the usecase of kafkajs callback not returning promise
          // is not typescript valid, but it might (and is) implemented in real life (nestjs)
          // and does not break the library.
          eachBatch: async (_payload: EachBatchPayload) => {
            return;
          },
        });
        const payload: EachBatchPayload = createEachBatchPayload();
        await runConfig?.eachBatch!(payload);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 3);
      });
    });
  });

  describe('context propagation', () => {
    beforeEach(() => {
      patchProducerSend(async (): Promise<RecordMetadata[]> => []);
      storeRunConfig();
      instrumentation.disable();
      instrumentation.enable();
      producer = kafka.producer();
      consumer = kafka.consumer({ groupId: 'testing-group-id' });
    });

    it('context injected in producer is extracted in consumer', async () => {
      let callbackBaggage: Baggage | undefined;
      consumer.run({
        eachMessage: async (_payload: EachMessagePayload): Promise<void> => {
          callbackBaggage = propagation.getBaggage(context.active());
        },
      });

      await context.with(
        propagation.setBaggage(
          context.active(),
          propagation.createBaggage({ foo: { value: 'bar' } })
        ),
        async () => {
          await producer.send({
            topic: 'topic-name-1',
            messages: [
              {
                value: 'testing message content',
              },
            ],
          });
        }
      );

      assert.strictEqual(messagesSent.length, 1);
      const consumerPayload: EachMessagePayload = {
        topic: 'topic-name-1',
        partition: 0,
        message: {
          key: Buffer.alloc(0),
          value: Buffer.alloc(0),
          timestamp: '1234',
          attributes: 0,
          offset: '0',
          headers: messagesSent[0].headers ?? {},
        },
        heartbeat: async () => {},
        pause: () => () => {},
      };
      await runConfig?.eachMessage!(consumerPayload);

      const spans = getTestSpans();
      assert.strictEqual(spans.length, 2);
      const [producerSpan, consumerSpan] = spans;
      assert.strictEqual(
        consumerSpan.spanContext().traceId,
        producerSpan.spanContext().traceId
      );
      assert.strictEqual(
        consumerSpan.parentSpanId,
        producerSpan.spanContext().spanId
      );
      assert.strictEqual(callbackBaggage!.getAllEntries().length, 1);
      assert.strictEqual(callbackBaggage!.getEntry('foo')?.value, 'bar');
    });

    it('context injected in producer is extracted as links in batch consumer', async () => {
      consumer.run({
        eachBatch: async (_payload: EachBatchPayload): Promise<void> => {},
      });

      await producer.send({
        topic: 'topic-name-1',
        messages: [
          {
            value: 'testing message content',
          },
        ],
      });

      assert.strictEqual(messagesSent.length, 1);
      const consumerPayload: EachBatchPayload = {
        batch: {
          topic: 'topic-name-1',
          partition: 0,
          highWatermark: '1234',
          messages: [
            {
              key: Buffer.alloc(0),
              value: Buffer.alloc(0),
              timestamp: '1234',
              size: 0,
              attributes: 0,
              offset: '0',
              headers: messagesSent[0].headers,
            },
          ],
        },
      } as EachBatchPayload;
      await runConfig?.eachBatch!(consumerPayload);

      const spans = getTestSpans();
      assert.strictEqual(spans.length, 3);
      const [producerSpan, receivingSpan, processingSpan] = spans;

      // processing span should be the child of receiving span and link to relevant producer
      assert.strictEqual(
        processingSpan.spanContext().traceId,
        receivingSpan.spanContext().traceId
      );
      assert.strictEqual(
        processingSpan.parentSpanId,
        receivingSpan.spanContext().spanId
      );
      assert.strictEqual(processingSpan.links.length, 1);
      assert.strictEqual(
        processingSpan.links[0].context.traceId,
        producerSpan.spanContext().traceId
      );
      assert.strictEqual(
        processingSpan.links[0].context.spanId,
        producerSpan.spanContext().spanId
      );

      // receiving span should start a new trace
      assert.strictEqual(receivingSpan.parentSpanId, undefined);
      assert.notStrictEqual(
        receivingSpan.spanContext().traceId,
        producerSpan.spanContext().traceId
      );
    });
  });
});
