/*
 * Copyright The OpenTelemetry Authors, Aspecto
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
  ATTR_MESSAGING_SYSTEM,
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_OPERATION_TYPE,
  ATTR_MESSAGING_DESTINATION_PARTITION_ID,
  ATTR_MESSAGING_KAFKA_MESSAGE_KEY,
  ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE,
  ATTR_MESSAGING_KAFKA_OFFSET,
  ATTR_MESSAGING_OPERATION_NAME,
  METRIC_MESSAGING_CLIENT_SENT_MESSAGES,
  MESSAGING_SYSTEM_VALUE_KAFKA,
  METRIC_MESSAGING_PROCESS_DURATION,
  METRIC_MESSAGING_CLIENT_CONSUMED_MESSAGES,
  METRIC_MESSAGING_CLIENT_OPERATION_DURATION,
} from '../src/semconv';
import {
  getTestSpans,
  initMeterProvider,
  registerInstrumentationTesting,
  TestMetricReader,
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
import { bufferTextMapGetter } from '../src/propagator';
import {
  ATTR_ERROR_TYPE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  assertFailedSendSpans,
  assertMetricCollection,
  assertSuccessfulSendSpans,
  haveSameTraceId,
} from './utils';

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
  let transaction: kafkajs.Transaction;

  const patchProducerSend = (
    cb: () => Promise<RecordMetadata[]>,
    transactionOpts?: {
      rejectTransaction?: boolean;
      rejectCommit?: boolean;
      rejectAbort?: boolean;
      rejectSend?: boolean;
    }
  ) => {
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

      producer.transaction = async function () {
        if (transactionOpts?.rejectTransaction) {
          return Promise.reject(
            new Error('error thrown from kafka client transaction')
          );
        }
        transaction = {
          send: async (_record: ProducerRecord) => {
            if (transactionOpts?.rejectSend) {
              return Promise.reject(
                new Error('error thrown from kafka client transaction send')
              );
            }
            messagesSent.push(..._record.messages);
            return cb();
          },

          sendBatch: async (_batch: ProducerBatch) => {
            if (transactionOpts?.rejectSend) {
              return Promise.reject(
                new Error(
                  'error thrown from kafka client transaction sendBatch'
                )
              );
            }
            _batch.topicMessages?.forEach(t =>
              messagesSent.push(...t.messages)
            );
            return cb();
          },

          commit: async () => {
            if (transactionOpts?.rejectCommit) {
              return Promise.reject(
                new Error('error thrown from kafka client transaction commit')
              );
            }
            return cb();
          },

          abort: async () => {
            if (transactionOpts?.rejectAbort) {
              return Promise.reject(
                new Error('error thrown from kafka client transaction abort')
              );
            }
            return cb();
          },
        } as unknown as kafkajs.Transaction;
        return transaction;
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

  let metricReader: TestMetricReader;
  beforeEach(() => {
    messagesSent = [];
    metricReader = initMeterProvider(instrumentation);
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
      const defaultRecordMetadata = [
        {
          topicName: 'topic-name-1',
          partition: 0,
          errorCode: 123,
          offset: '18',
          timestamp: '123456',
        },
      ];
      function initializeProducer(
        recordMetadata: RecordMetadata[] = defaultRecordMetadata
      ) {
        patchProducerSend(
          async (): Promise<RecordMetadata[]> => recordMetadata
        );
        instrumentation.disable();
        instrumentation.enable();
        producer = kafka.producer();
      }
      beforeEach(() => {
        initializeProducer();
      });

      it('simple send create span with right attributes, pass return value correctly and propagate context', async () => {
        const res: RecordMetadata[] = await producer.send({
          topic: 'topic-name-1',
          messages: [
            {
              partition: 42,
              key: 'message-key-0',
              value: 'testing message content',
            },
          ],
        });

        assert.strictEqual(res.length, 1);
        assert.strictEqual(res[0].topicName, 'topic-name-1');

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.name, 'send topic-name-1');
        await assertSuccessfulSendSpans({
          spans: [span],
          metricReader,
          expectedMetrics: [
            { topic: 'topic-name-1', value: 1, partitionId: '42' },
          ],
          perSpan: {
            0: {
              [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
              [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '42',
              [ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE]: undefined,
              [ATTR_MESSAGING_KAFKA_MESSAGE_KEY]: 'message-key-0',
            },
          },
        });

        assert.strictEqual(messagesSent.length, 1);
        expectKafkaHeadersToMatchSpanContext(
          messagesSent[0],
          span as ReadableSpan
        );
      });

      it('simple send create span with tombstone attribute', async () => {
        await producer.send({
          topic: 'topic-name-1',
          messages: [
            {
              partition: 42,
              key: 'message-key-1',
              value: null,
            },
          ],
        });

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.name, 'send topic-name-1');

        await assertSuccessfulSendSpans({
          spans: [span],
          metricReader,
          expectedMetrics: [
            { topic: 'topic-name-1', value: 1, partitionId: '42' },
          ],
          perSpan: {
            0: {
              [ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE]: true,
            },
          },
        });
      });

      it('send two messages', async () => {
        initializeProducer([
          {
            topicName: 'topic-name-1',
            partition: 0,
            errorCode: 123,
            offset: '18',
            timestamp: '123456',
          },
          {
            topicName: 'topic-name-1',
            partition: 0,
            errorCode: 123,
            offset: '19',
            timestamp: '123456',
          },
        ]);
        await producer.send({
          topic: 'topic-name-1',
          messages: [
            {
              partition: 0,
              value: 'message1',
            },
            {
              partition: 0,
              value: 'message2',
            },
          ],
        });

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 2);
        assert.strictEqual(spans[0].name, 'send topic-name-1');
        assert.strictEqual(spans[1].name, 'send topic-name-1');

        assert.strictEqual(messagesSent.length, 2);
        expectKafkaHeadersToMatchSpanContext(
          messagesSent[0],
          spans[0] as ReadableSpan
        );
        expectKafkaHeadersToMatchSpanContext(
          messagesSent[1],
          spans[1] as ReadableSpan
        );
        assertMetricCollection(await metricReader.collect(), {
          [METRIC_MESSAGING_CLIENT_SENT_MESSAGES]: [
            {
              value: 2,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '0',
                [ATTR_MESSAGING_OPERATION_NAME]: 'send',
              },
            },
          ],
        });
      });

      it('send batch', async () => {
        initializeProducer([
          {
            topicName: 'topic-name-1',
            partition: 0,
            errorCode: 123,
            offset: '18',
            timestamp: '123456',
          },
          {
            topicName: 'topic-name-1',
            partition: 0,
            errorCode: 123,
            offset: '19',
            timestamp: '123456',
          },
          {
            topicName: 'topic-name-2',
            partition: 1,
            errorCode: 123,
            offset: '19',
            timestamp: '123456',
          },
        ]);
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
                  partition: 1,
                  value: 'message2-1',
                },
              ],
            },
          ],
        });

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 3);
        assert.strictEqual(spans[0].name, 'send topic-name-1');
        assert.strictEqual(spans[1].name, 'send topic-name-1');
        assert.strictEqual(spans[2].name, 'send topic-name-2');

        assert.strictEqual(messagesSent.length, 3);
        for (let i = 0; i < 3; i++) {
          expectKafkaHeadersToMatchSpanContext(
            messagesSent[i],
            spans[i] as ReadableSpan
          );
        }
        assertSuccessfulSendSpans({
          spans,
          metricReader,
          expectedMetrics: [
            { topic: 'topic-name-1', value: 2 },
            { topic: 'topic-name-2', value: 1, partitionId: '1' },
          ],
        });
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
        await assertFailedSendSpans({
          spans: [span],
          metricReader,
          errorMessage: 'error thrown from kafka client send',
          expectedTopicCounts: {
            'topic-name-1': 1,
          },
        });
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
        await assertFailedSendSpans({
          spans: spans,
          metricReader,
          errorMessage: 'error thrown from kafka client send',
          expectedTopicCounts: {
            'topic-name-1': 2,
          },
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
        await assertFailedSendSpans({
          spans,
          metricReader,
          errorMessage: 'error thrown from kafka client send',
          expectedTopicCounts: {
            'topic-name-1': 2,
            'topic-name-2': 1,
          },
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

    describe('transaction instrumentation', () => {
      function assertSpanHasParent(
        parent: ReadableSpan,
        child: ReadableSpan,
        msg = 'child should reference parent spanId'
      ) {
        assert.strictEqual(
          child.parentSpanContext?.spanId,
          parent.spanContext().spanId,
          msg
        );
      }
      const defaultFallback = async () => [
        { topicName: 'topic-name-1' } as RecordMetadata,
      ];

      const prepareTestProducer = (
        fallback: Parameters<typeof patchProducerSend>[0] = defaultFallback,
        opts: Parameters<typeof patchProducerSend>[1] = {}
      ) => {
        patchProducerSend(fallback, opts);
        instrumentation.disable();
        instrumentation.enable();
        return kafka.producer();
      };

      describe('transaction commit', () => {
        it('commits after two sends with unset span statuses', async () => {
          const producer = prepareTestProducer();
          const tx = await producer.transaction();

          await tx.send({ topic: 'topic-name-1', messages: [{ value: 'a' }] });
          await tx.send({ topic: 'topic-name-1', messages: [{ value: 'b' }] });
          await tx.commit();

          const spans = getTestSpans();
          const transactionSpan = spans.find(s => s.name === 'transaction');
          const sendSpans = spans.filter(s => s.name === 'send topic-name-1');
          assert.ok(transactionSpan);
          assert.strictEqual(spans.length, 3);
          assert.strictEqual(transactionSpan.kind, SpanKind.INTERNAL);
          assert.strictEqual(transactionSpan.status.code, SpanStatusCode.OK);

          assert.strictEqual(sendSpans.length, 2);
          assert.strictEqual(sendSpans[0].name, 'send topic-name-1');
          assert.strictEqual(sendSpans[1].name, 'send topic-name-1');
          await assertSuccessfulSendSpans({
            spans: sendSpans,
            metricReader,
            expectedMetrics: [{ topic: 'topic-name-1', value: 2 }],
            perSpan: Object.fromEntries(
              Array.from({ length: 2 }, (_, i) => [
                i,
                {
                  [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                  [ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE]: undefined,
                },
              ])
            ),
          });

          sendSpans.forEach((s, i) => {
            assertSpanHasParent(transactionSpan, s);
            expectKafkaHeadersToMatchSpanContext(
              messagesSent[i],
              s as ReadableSpan
            );
          });
          assert.ok(haveSameTraceId(spans));
        });

        it('sets transaction span to error on commit rejection, send remains unset', async () => {
          const producer = prepareTestProducer(defaultFallback, {
            rejectCommit: true,
          });
          const tx = await producer.transaction();
          await tx.send({ topic: 'topic-name-1', messages: [{ value: 'x' }] });

          await assert.rejects(tx.commit());

          const spans = getTestSpans();
          const transactionSpan = spans.find(s => s.name === 'transaction');
          const sendSpan = spans.find(s => s.name.startsWith('send'));
          assert.ok(transactionSpan);
          assert.ok(sendSpan);
          assert.strictEqual(transactionSpan.kind, SpanKind.INTERNAL);
          assertSpanHasParent(transactionSpan, sendSpan);
          assert.strictEqual(transactionSpan.status.code, SpanStatusCode.ERROR);
          assert.strictEqual(
            transactionSpan.status.message,
            'error thrown from kafka client transaction commit'
          );
          assert.strictEqual(sendSpan.status.code, SpanStatusCode.UNSET);
          assert.strictEqual(sendSpan.name, 'send topic-name-1');
          expectKafkaHeadersToMatchSpanContext(
            messagesSent[0],
            sendSpan as ReadableSpan
          );
          assert.ok(haveSameTraceId(spans));
        });
      });

      describe('transaction abort', () => {
        it('spans remain unset when abort succeeds', async () => {
          const producer = prepareTestProducer();
          const tx = await producer.transaction();
          await tx.send({ topic: 'topic-name-1', messages: [{ value: 'a' }] });

          await tx.abort();

          const spans = getTestSpans();
          const [transactionSpan, sendSpan] = [
            spans.find(s => s.name === 'transaction'),
            spans.find(s => s.name === 'send topic-name-1'),
          ];
          assert.ok(transactionSpan);
          assert.ok(sendSpan);
          assertSpanHasParent(transactionSpan, sendSpan);
          expectKafkaHeadersToMatchSpanContext(
            messagesSent[0],
            sendSpan as ReadableSpan
          );
          assert.strictEqual(transactionSpan.kind, SpanKind.INTERNAL);
          assert.strictEqual(transactionSpan.status.code, SpanStatusCode.UNSET);
          assert.strictEqual(sendSpan.status.code, SpanStatusCode.UNSET);
          assert.strictEqual(sendSpan.name, 'send topic-name-1');

          assert.ok(haveSameTraceId(spans));
        });

        it('sets transaction span to error on abort rejection', async () => {
          const producer = prepareTestProducer(defaultFallback, {
            rejectAbort: true,
          });
          const tx = await producer.transaction();
          await tx.send({
            topic: 'topic-name-1',
            messages: [{ value: 'fail' }],
          });

          await assert.rejects(tx.abort());

          const spans = getTestSpans();
          const [transactionSpan, sendSpan] = [
            spans.find(s => s.name === 'transaction'),
            spans.find(s => s.name.startsWith('send')),
          ];
          assert.ok(transactionSpan);
          assert.ok(sendSpan);
          assertSpanHasParent(transactionSpan, sendSpan);
          assert.strictEqual(transactionSpan.kind, SpanKind.INTERNAL);
          assert.strictEqual(transactionSpan.status.code, SpanStatusCode.ERROR);
          assert.strictEqual(
            transactionSpan.status.message,
            'error thrown from kafka client transaction abort'
          );
          assert.strictEqual(sendSpan.status.code, SpanStatusCode.UNSET);
          assert.ok(haveSameTraceId(spans));
        });
      });

      describe('span relations inside transaction', () => {
        beforeEach(() => {
          patchProducerSend(async () => [
            { topicName: 'topic-name-1' } as RecordMetadata,
            { topicName: 'topic-name-2' } as RecordMetadata,
          ]);
          instrumentation.disable();
          instrumentation.enable();
          producer = kafka.producer();
        });

        it('associates multiple sends with the same transaction and traceId', async () => {
          const tx = await producer.transaction();
          await tx.send({ topic: 'topic-name-1', messages: [{ value: '1' }] });
          await tx.send({ topic: 'topic-name-1', messages: [{ value: '2' }] });
          await tx.commit();

          const spans = getTestSpans();
          const transactionSpan = spans.find(s => s.name === 'transaction');
          const sendSpans = spans.filter(s => s.name.startsWith('send'));
          assert.ok(transactionSpan);
          assert.ok(sendSpans);
          sendSpans.forEach(s => assertSpanHasParent(transactionSpan, s));
          assert.ok(haveSameTraceId(spans));
        });

        it('associates sendBatch messages with parent transaction and same traceId', async () => {
          const tx = await producer.transaction();
          await tx.sendBatch({
            topicMessages: [
              {
                topic: 'topic-name-1',
                messages: [{ value: 'a' }, { value: 'b' }],
              },
              { topic: 'topic-name-2', messages: [{ value: 'c' }] },
            ],
          });
          await tx.commit();
          const spans = getTestSpans();
          const transactionSpan = spans.find(s => s.name === 'transaction');
          const sendSpans = spans.filter(s => s.name.startsWith('send'));
          assert.ok(transactionSpan);
          assert.strictEqual(sendSpans.length, 3);
          assert.strictEqual(spans[0].name, 'send topic-name-1');
          assert.strictEqual(spans[1].name, 'send topic-name-1');
          assert.strictEqual(spans[2].name, 'send topic-name-2');
          assertSuccessfulSendSpans({
            spans: sendSpans,
            metricReader,
            expectedMetrics: [
              { topic: 'topic-name-1', value: 2 },
              { topic: 'topic-name-2', value: 1 },
            ],
          });
          sendSpans.forEach(s => assertSpanHasParent(transactionSpan, s));
          assert.ok(haveSameTraceId(spans));
        });
      });

      describe('send failure inside transaction', () => {
        beforeEach(() => {
          patchProducerSend(
            async () => [{ topicName: 'topic-name-1' } as RecordMetadata],
            { rejectSend: true }
          );
          instrumentation.disable();
          instrumentation.enable();
          producer = kafka.producer();
        });

        it('sets send span and transaction span to error when send fails', async () => {
          const tx = await producer.transaction();
          await assert.rejects(
            tx.send({ topic: 'topic-name-1', messages: [{ value: 'oops' }] })
          );
          await tx.abort();

          const spans = getTestSpans();
          const [transactionSpan, sendSpan] = [
            spans.find(s => s.name === 'transaction'),
            spans.find(s => s.name === 'send topic-name-1'),
          ];
          assert.ok(transactionSpan);
          assert.ok(sendSpan);
          const errorMessage =
            'error thrown from kafka client transaction send';
          assertSpanHasParent(transactionSpan, sendSpan);
          await assertFailedSendSpans({
            spans: [sendSpan],
            metricReader,
            errorMessage,
            expectedTopicCounts: {
              'topic-name-1': 1,
            },
          });
          assert.strictEqual(transactionSpan.status.code, SpanStatusCode.ERROR);
          assert.strictEqual(transactionSpan.status.message, errorMessage);
          assert.ok(haveSameTraceId(spans));
        });

        it('sets all sendBatch spans and transaction span to error when sendBatch fails', async () => {
          const tx = await producer.transaction();
          await assert.rejects(
            tx.sendBatch({
              topicMessages: [
                {
                  topic: 'topic-name-1',
                  messages: [{ value: 'x' }, { value: 'y' }],
                },
              ],
            })
          );
          await tx.abort();

          const spans = getTestSpans();
          const transactionSpan = spans.find(s => s.name === 'transaction');
          const sendSpans = spans.filter(s => s.name === 'send topic-name-1');
          assert.ok(transactionSpan);
          assert.ok(sendSpans);
          await assertFailedSendSpans({
            spans: sendSpans,
            metricReader,
            errorMessage:
              'error thrown from kafka client transaction sendBatch',
            expectedTopicCounts: {
              'topic-name-1': 2,
            },
          });
          const errorMessage =
            'error thrown from kafka client transaction sendBatch';
          sendSpans.forEach(s => {
            assertSpanHasParent(transactionSpan, s);
          });
          assert.strictEqual(transactionSpan.status.code, SpanStatusCode.ERROR);
          assert.strictEqual(transactionSpan.status.message, errorMessage);
          assert.ok(haveSameTraceId(spans));
        });
      });
      describe('transaction setup errors', () => {
        beforeEach(() => {
          patchProducerSend(
            async () => [{ topicName: 'topic-name-1' } as RecordMetadata],
            { rejectTransaction: true }
          );
          instrumentation.disable();
          instrumentation.enable();
          producer = kafka.producer();
        });

        it('calls catch block when transaction creation fails and transaction span sets error attribute', async () => {
          await assert.rejects(
            () => producer.transaction(),
            /error thrown from kafka client transaction/
          );

          const spans = getTestSpans();
          assert.strictEqual(spans.length, 1);

          const transactionSpan = spans.find(s => s.name === 'transaction');
          assert.ok(transactionSpan);
          assert.strictEqual(transactionSpan.kind, SpanKind.INTERNAL);
          assert.strictEqual(transactionSpan.status.code, SpanStatusCode.ERROR);

          assert.strictEqual(
            transactionSpan.status.code,
            SpanStatusCode.ERROR,
            `Expected transactionSpan status.code to be ERROR`
          );
          assert.strictEqual(
            transactionSpan.status.message,
            'error thrown from kafka client transaction'
          );
          const exceptionEvent = transactionSpan.events.find(
            e => e.name === 'exception'
          );
          assert.ok(exceptionEvent, 'recordException was not called');
        });
      });
    });
  });

  describe('consumer', () => {
    interface CreateMessageParams {
      offset: string;
      key?: string | null;
      tombstone?: boolean;
    }

    const createKafkaMessage = ({
      offset,
      key = 'message-key',
      tombstone = false,
    }: CreateMessageParams): KafkaMessage => {
      return {
        key: typeof key === 'string' ? Buffer.from(key, 'utf8') : key,
        value: tombstone ? null : Buffer.from('message content', 'utf8'),
        timestamp: '1234',
        size: 10,
        attributes: 1,
        offset,
      };
    };

    const createEachMessagePayload = (
      params: Partial<CreateMessageParams> = {}
    ): EachMessagePayload => {
      return {
        topic: 'topic-name-1',
        partition: 1,
        message: createKafkaMessage({ offset: '123', ...params }),
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
          messages: [
            createKafkaMessage({ offset: '124' }),
            createKafkaMessage({ offset: '125' }),
          ],
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
        const payload = createEachMessagePayload();
        await runConfig?.eachMessage!(payload);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.name, 'process topic-name-1');
        assert.strictEqual(span.parentSpanContext?.spanId, undefined);
        assert.strictEqual(span.kind, SpanKind.CONSUMER);
        assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
        assert.strictEqual(span.attributes[ATTR_MESSAGING_SYSTEM], 'kafka');
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_DESTINATION_NAME],
          'topic-name-1'
        );
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_OPERATION_TYPE],
          'process'
        );
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_DESTINATION_PARTITION_ID],
          '1'
        );
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_KAFKA_MESSAGE_KEY],
          'message-key'
        );
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE],
          undefined
        );
        assert.strictEqual(span.attributes[ATTR_MESSAGING_KAFKA_OFFSET], '123');
        assertMetricCollection(await metricReader.collect(), {
          [METRIC_MESSAGING_PROCESS_DURATION]: [
            {
              count: 1,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '1',
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
              },
            },
          ],
          [METRIC_MESSAGING_CLIENT_CONSUMED_MESSAGES]: [
            {
              value: 1,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '1',
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
              },
            },
          ],
        });
      });

      it('consume eachMessage tombstone', async () => {
        consumer.run({
          eachMessage: async (
            _payload: EachMessagePayload
          ): Promise<void> => {},
        });
        const payload = createEachMessagePayload({ tombstone: true });
        await runConfig?.eachMessage!(payload);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.name, 'process topic-name-1');
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_KAFKA_MESSAGE_KEY],
          'message-key'
        );
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE],
          true
        );
      });

      it('consume eachMessage with null key', async () => {
        consumer.run({
          eachMessage: async (
            _payload: EachMessagePayload
          ): Promise<void> => {},
        });
        const payload = createEachMessagePayload({ key: null });
        await runConfig?.eachMessage!(payload);

        const spans = getTestSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.name, 'process topic-name-1');
        assert.strictEqual(
          span.attributes[ATTR_MESSAGING_KAFKA_MESSAGE_KEY],
          undefined
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
        assertMetricCollection(await metricReader.collect(), {
          [METRIC_MESSAGING_PROCESS_DURATION]: [
            {
              count: 1,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '1',
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
                [ATTR_ERROR_TYPE]: 'Error',
              },
            },
          ],
          [METRIC_MESSAGING_CLIENT_CONSUMED_MESSAGES]: [
            {
              value: 1,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '1',
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
                [ATTR_ERROR_TYPE]: 'Error',
              },
            },
          ],
        });
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
        assertMetricCollection(await metricReader.collect(), {
          [METRIC_MESSAGING_PROCESS_DURATION]: [
            {
              count: 1,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '1',
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
                [ATTR_ERROR_TYPE]: '_OTHER',
              },
            },
          ],
          [METRIC_MESSAGING_CLIENT_CONSUMED_MESSAGES]: [
            {
              value: 1,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '1',
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
                [ATTR_ERROR_TYPE]: '_OTHER',
              },
            },
          ],
        });
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
        assertMetricCollection(await metricReader.collect(), {
          [METRIC_MESSAGING_PROCESS_DURATION]: [
            {
              count: 1,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '1',
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
                [ATTR_ERROR_TYPE]: '_OTHER',
              },
            },
          ],
          [METRIC_MESSAGING_CLIENT_CONSUMED_MESSAGES]: [
            {
              value: 1,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '1',
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
                [ATTR_ERROR_TYPE]: '_OTHER',
              },
            },
          ],
        });
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
          assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
          assert.strictEqual(span.attributes[ATTR_MESSAGING_SYSTEM], 'kafka');
          assert.strictEqual(
            span.attributes[ATTR_MESSAGING_DESTINATION_NAME],
            'topic-name-1'
          );
        });

        const [recvSpan, msg1Span, msg2Span] = spans;

        assert.strictEqual(recvSpan.kind, SpanKind.CLIENT);
        assert.strictEqual(recvSpan.name, 'poll topic-name-1');
        assert.strictEqual(recvSpan.parentSpanContext?.spanId, undefined);
        assert.strictEqual(
          recvSpan.attributes[ATTR_MESSAGING_OPERATION_TYPE],
          'receive'
        );
        assert.strictEqual(
          recvSpan.attributes[ATTR_MESSAGING_OPERATION_NAME],
          'poll'
        );

        assert.strictEqual(msg1Span.kind, SpanKind.CONSUMER);
        assert.strictEqual(msg1Span.name, 'process topic-name-1');
        assert.strictEqual(
          msg1Span.parentSpanContext?.spanId,
          recvSpan.spanContext().spanId
        );
        assert.strictEqual(
          msg1Span.attributes[ATTR_MESSAGING_OPERATION_TYPE],
          'process'
        );
        assert.strictEqual(
          msg1Span.attributes[ATTR_MESSAGING_OPERATION_NAME],
          'process'
        );

        assert.strictEqual(
          msg2Span.parentSpanContext?.spanId,
          recvSpan.spanContext().spanId
        );
        assert.strictEqual(
          msg2Span.attributes[ATTR_MESSAGING_OPERATION_TYPE],
          'process'
        );
        assert.strictEqual(
          msg2Span.attributes[ATTR_MESSAGING_OPERATION_NAME],
          'process'
        );
        assertMetricCollection(await metricReader.collect(), {
          [METRIC_MESSAGING_PROCESS_DURATION]: [
            {
              count: 2,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '1234',
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
              },
            },
          ],
          [METRIC_MESSAGING_CLIENT_CONSUMED_MESSAGES]: [
            {
              value: 2,
              attributes: {
                [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [ATTR_MESSAGING_DESTINATION_NAME]: 'topic-name-1',
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: '1234',
                [ATTR_MESSAGING_OPERATION_NAME]: 'process',
              },
            },
          ],
        });
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
        consumerSpan.parentSpanContext?.spanId,
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
        processingSpan.parentSpanContext?.spanId,
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
      assert.strictEqual(receivingSpan.parentSpanContext?.spanId, undefined);
      assert.notStrictEqual(
        receivingSpan.spanContext().traceId,
        producerSpan.spanContext().traceId
      );
    });
  });
  describe('client duration metric', () => {
    it('records the metric', async () => {
      instrumentation['_recordClientDurationMetric']({
        payload: {
          broker: 'kafka.host:4789',
          duration: 250,
          apiName: 'some-operation',
          apiKey: 123,
          apiVersion: 1,
          clientId: 'client-id',
          correlationId: 456,
          createdAt: Date.now(),
          pendingDuration: 0,
          sentAt: Date.now(),
          size: 1024,
        },
      });
      assertMetricCollection(await metricReader.collect(), {
        [METRIC_MESSAGING_CLIENT_OPERATION_DURATION]: [
          {
            count: 1,
            buckets: { '0.25': 1 },
            attributes: {
              [ATTR_MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
              [ATTR_MESSAGING_OPERATION_NAME]: 'some-operation',
              [ATTR_SERVER_ADDRESS]: 'kafka.host',
              [ATTR_SERVER_PORT]: 4789,
            },
          },
        ],
      });
    });
  });

  describe('bufferTextMapGetter', () => {
    it('is possible to retrieve keys case insensitively', () => {
      assert.strictEqual(
        bufferTextMapGetter.get(
          {
            'X-B3-Trace-Id': '123',
          },
          'x-b3-trace-id'
        ),
        '123'
      );
    });
    it('exposes a keys method', () => {
      assert.deepStrictEqual(bufferTextMapGetter.keys({ a: 1, b: 2 }), [
        'a',
        'b',
      ]);
    });
  });
});
