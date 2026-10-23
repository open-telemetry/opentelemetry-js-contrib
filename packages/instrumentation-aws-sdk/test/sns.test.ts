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
  ATTR_MESSAGING_DESTINATION_NAME,
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
      expect(publishSpan.attributes[ATTR_MESSAGING_DESTINATION_NAME]).toBe(
        topicV3ARN
      );
      expect(publishSpan.attributes[ATTR_AWS_SNS_TOPIC_ARN]).toBe(topicV3ARN);
      expect(publishSpan.attributes[ATTR_RPC_METHOD]).toBe('Publish');
      expect(publishSpan.attributes[ATTR_MESSAGING_SYSTEM]).toBe('aws.sns');
      expect(publishSpan.kind).toBe(SpanKind.PRODUCER);
    });

    it('keeps target arn behavior unchanged', async () => {
      const targetArn =
        'arn:aws:sns:us-east-1:000000000:endpoint/GCM/app/device';

      await sns.publish({
        Message: 'sns message',
        TargetArn: targetArn,
      });

      const publishSpans = getTestSpans().filter(
        (s: ReadableSpan) => s.name === 'endpoint/GCM/app/device send'
      );
      expect(publishSpans.length).toBe(1);
      expect(publishSpans[0].attributes[ATTR_MESSAGING_DESTINATION]).toBe(
        'endpoint/GCM/app/device'
      );
      expect(publishSpans[0].attributes[ATTR_MESSAGING_DESTINATION_NAME]).toBe(
        targetArn
      );
    });

    it('masks the phone number in span attributes by default', async () => {
      const PhoneNumber = '+61123456123';
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
        '+61******123'
      );
      expect(publishSpan.attributes[ATTR_MESSAGING_DESTINATION_NAME]).toBe(
        '+61******123'
      );
      const leaks = Object.values(publishSpan.attributes).filter(
        value => typeof value === 'string' && value.includes(PhoneNumber)
      );
      expect(leaks).toEqual([]);
      expect(publishSpan.attributes[ATTR_AWS_SNS_TOPIC_ARN]).toBeUndefined();
    });

    it('does not expose short phone numbers', async () => {
      const PhoneNumber = '123456789';
      await sns.publish({
        Message: 'sns message',
        PhoneNumber,
      });

      const publishSpans = getTestSpans().filter(
        (s: ReadableSpan) => s.name === 'phone_number send'
      );
      expect(publishSpans.length).toBe(1);
      expect(publishSpans[0].attributes[ATTR_MESSAGING_DESTINATION]).toBe(
        '******'
      );
      expect(publishSpans[0].attributes[ATTR_MESSAGING_DESTINATION_NAME]).toBe(
        '******'
      );
    });

    it('preserves local number context when masking', async () => {
      const PhoneNumber = '0401234567';
      await sns.publish({
        Message: 'sns message',
        PhoneNumber,
      });

      const publishSpans = getTestSpans().filter(
        (s: ReadableSpan) => s.name === 'phone_number send'
      );
      expect(publishSpans.length).toBe(1);
      expect(publishSpans[0].attributes[ATTR_MESSAGING_DESTINATION]).toBe(
        '040******567'
      );
      expect(publishSpans[0].attributes[ATTR_MESSAGING_DESTINATION_NAME]).toBe(
        '040******567'
      );
    });

    it('captures the full phone number only when enabled', async () => {
      const PhoneNumber = '+15555550100';
      const previousConfig = instrumentation.getConfig();
      instrumentation.setConfig({
        ...previousConfig,
        snsCaptureFullPhoneNumber: true,
      });

      try {
        await sns.publish({
          Message: 'sns message',
          PhoneNumber,
        });

        const publishSpans = getTestSpans().filter(
          (s: ReadableSpan) => s.name === 'phone_number send'
        );
        expect(publishSpans.length).toBe(1);
        expect(publishSpans[0].attributes[ATTR_MESSAGING_DESTINATION]).toBe(
          PhoneNumber
        );
        expect(
          publishSpans[0].attributes[ATTR_MESSAGING_DESTINATION_NAME]
        ).toBe(PhoneNumber);
      } finally {
        instrumentation.setConfig(previousConfig);
      }
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
