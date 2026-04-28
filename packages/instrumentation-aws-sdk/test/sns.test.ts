/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import { SNS as SNSv3 } from '@aws-sdk/client-sns';
import * as fs from 'fs';
import * as nock from 'nock';

import { expect } from 'expect';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
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
