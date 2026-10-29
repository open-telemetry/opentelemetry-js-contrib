/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import { instrumentation } from './load-instrumentation';
import { SNS as SNSv3 } from '@aws-sdk/client-sns';
import * as fs from 'fs';
import * as nock from 'nock';

import { expect } from 'expect';
import { ReadableSpan } from '@opentelemetry/sdk-trace';
import {
  ATTR_MESSAGING_SYSTEM,
  ATTR_RPC_METHOD,
  ATTR_AWS_SNS_TOPIC_ARN,
} from '../src/semconv';
import {
  ATTR_MESSAGING_DESTINATION,
  ATTR_MESSAGING_DESTINATION_KIND,
  MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
} from '../src/semconv-obsolete';
import { SpanKind } from '@opentelemetry/api';

describe('SNS - v3', () => {
  let sns: any;

  describe('publish', () => {
    beforeEach(() => {
      sns = new SNSv3({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'abcde',
          secretAccessKey: 'abcde',
        },
      });

      nock('https://sns.us-east-1.amazonaws.com/')
        .post('/')
        .reply(
          200,
          fs.readFileSync('./test/mock-responses/sns-publish.xml', 'utf8')
        );
    });

    it('topic arn', async () => {
      const topicV3Name = 'dummy-sns-v3-topic';
      const topicV3ARN = `arn:aws:sns:us-east-1:000000000:${topicV3Name}`;

      await sns.publish({
        Message: 'sns message',
        TopicArn: topicV3ARN,
      });

      const publishSpans = getTestSpans().filter(
        (s: ReadableSpan) => s.name === `${topicV3Name} send`
      );
      expect(publishSpans.length).toBe(1);

      const publishSpan = publishSpans[0];
      expect(publishSpan.attributes[ATTR_MESSAGING_DESTINATION_KIND]).toBe(
        MESSAGING_DESTINATION_KIND_VALUE_TOPIC
      );
      expect(publishSpan.attributes[ATTR_MESSAGING_DESTINATION]).toBe(
        topicV3Name
      );
      expect(publishSpan.attributes['messaging.destination.name']).toBe(
        topicV3ARN
      );
      expect(publishSpan.attributes[ATTR_AWS_SNS_TOPIC_ARN]).toBe(topicV3ARN);
      expect(publishSpan.attributes[ATTR_RPC_METHOD]).toBe('Publish');
      expect(publishSpan.attributes[ATTR_MESSAGING_SYSTEM]).toBe('aws.sns');
      expect(publishSpan.kind).toBe(SpanKind.PRODUCER);
    });

    it('phone number', async () => {
      const PhoneNumber = 'my phone number';
      await sns.publish({
        Message: 'sns message',
        PhoneNumber,
      });

      const publishSpans = getTestSpans().filter(
        (s: ReadableSpan) => s.name === 'phone_number send'
      );
      expect(publishSpans.length).toBe(1);
      const publishSpan = publishSpans[0];
      expect(publishSpan.attributes[ATTR_MESSAGING_DESTINATION]).toBe(
        PhoneNumber
      );
      expect(publishSpan.attributes[ATTR_AWS_SNS_TOPIC_ARN]).toBeUndefined();
    });
  });

  for (const command of ['publish', 'publishBatch'] as const) {
    describe(`${command} propagation`, () => {
      const topicName = 'batch-propagation-topic';
      const topicArn = `arn:aws:sns:us-east-1:123456789012:${topicName}`;

      afterEach(() => {
        nock.cleanAll();
        sns.destroy();
      });

      for (const attributeCount of [0, 1, 10]) {
        it(`preserves ${attributeCount} attributes and propagates when there is room`, async () => {
          let transformedInput: Record<string, any> = {};
          instrumentation.disable();
          instrumentation.setConfig({
            preRequestHook: (_span, requestInfo) => {
              transformedInput = requestInfo.request.commandInput;
            },
          });
          instrumentation.enable();

          sns = new SNSv3({
            region: 'us-east-1',
            credentials: {
              accessKeyId: 'abcde',
              secretAccessKey: 'abcde',
            },
          });
          const attributes = Object.fromEntries(
            Array.from({ length: attributeCount }, (_, i) => [
              `custom${i}`,
              { DataType: 'String', StringValue: `value${i}` },
            ])
          );
          const scope = nock('https://sns.us-east-1.amazonaws.com/')
            .post('/')
            .reply(
              200,
              fs.readFileSync(
                command === 'publish'
                  ? './test/mock-responses/sns-publish.xml'
                  : './test/mock-responses/sns-publish-batch.xml',
                'utf8'
              )
            );
          const message = {
            Message: 'first message',
            ...(attributeCount ? { MessageAttributes: attributes } : {}),
          };
          if (command === 'publish') {
            await sns.publish({ TopicArn: topicArn, ...message });
          } else {
            await sns.publishBatch({
              TopicArn: topicArn,
              PublishBatchRequestEntries: [
                { Id: 'first', ...message },
                { Id: 'second', Message: 'second message' },
              ],
            });
          }
          expect(scope.isDone()).toBe(true);
          const spans = getTestSpans();
          expect(spans.length).toBe(1);
          const [span] = spans;
          const { traceId, spanId } = span.spanContext();
          const traceparent = `00-${traceId}-${spanId}-01`;
          const propagatedContext =
            attributeCount === 10
              ? {}
              : {
                  traceparent: {
                    DataType: 'String',
                    StringValue: traceparent,
                  },
                };
          if (command === 'publish') {
            expect(transformedInput).toEqual({
              TopicArn: topicArn,
              ...message,
              MessageAttributes: { ...attributes, ...propagatedContext },
            });
          } else {
            expect(transformedInput).toEqual({
              TopicArn: topicArn,
              PublishBatchRequestEntries: [
                {
                  Id: 'first',
                  ...message,
                  MessageAttributes: { ...attributes, ...propagatedContext },
                },
                {
                  Id: 'second',
                  Message: 'second message',
                  MessageAttributes: {
                    traceparent: {
                      DataType: 'String',
                      StringValue: traceparent,
                    },
                  },
                },
              ],
            });
          }
          expect(span.kind).toBe(SpanKind.PRODUCER);
          expect(span.name).toBe(`${topicName} send`);
          expect(span.attributes[ATTR_RPC_METHOD]).toBe(
            command === 'publish' ? 'Publish' : 'PublishBatch'
          );
          expect(span.attributes[ATTR_MESSAGING_SYSTEM]).toBe('aws.sns');
          expect(span.attributes[ATTR_MESSAGING_DESTINATION]).toBe(topicName);
          expect(span.attributes[ATTR_AWS_SNS_TOPIC_ARN]).toBe(topicArn);
        });
      }
    });
  }

  describe('Create Topic', () => {
    beforeEach(() => {
      sns = new SNSv3({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'abcde',
          secretAccessKey: 'abcde',
        },
      });

      nock('https://sns.us-east-1.amazonaws.com/')
        .post('/')
        .reply(
          200,
          fs.readFileSync('./test/mock-responses/sns-create-topic.xml', 'utf8')
        );
    });

    it('should create topic ARN and capture expected trace attributes', async () => {
      const topicName = 'sns-topic-foo';
      const topicArn = `arn:aws:sns:us-east-1:123456789012:${topicName}`;
      await sns.createTopic({
        Name: topicName,
      });
      const createTopicSpans = getTestSpans().filter(
        (s: ReadableSpan) => s.name === 'SNS CreateTopic'
      );
      expect(createTopicSpans.length).toBe(1);
      const span = createTopicSpans[0];
      expect(span.attributes[ATTR_AWS_SNS_TOPIC_ARN]).toBe(topicArn);
      expect(span.kind).toBe(SpanKind.CLIENT);
    });
  });
});
