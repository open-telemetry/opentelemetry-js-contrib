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
import { AwsInstrumentation } from '../src';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
const instrumentation = registerInstrumentationTesting(
  new AwsInstrumentation()
);
import * as AWSv2 from 'aws-sdk';
import { SNS as SNSv3 } from '@aws-sdk/client-sns';
import * as fs from 'fs';
import * as nock from 'nock';

import { mockV2AwsSend } from './testing-utils';
import * as expect from 'expect';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import * as sinon from 'sinon';
import {
  MessagingDestinationKindValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';
import { SpanKind } from '@opentelemetry/api';

const responseMockSuccess = {
  requestId: '0000000000000',
  error: null,
};

const topicName = 'topic';
const fakeARN = `arn:aws:sns:region:000000000:${topicName}`;

describe('SNS - v2', () => {
  before(() => {
    AWSv2.config.credentials = {
      accessKeyId: 'test key id',
      expired: false,
      expireTime: new Date(),
      secretAccessKey: 'test acc key',
      sessionToken: 'test token',
    };
  });

  beforeEach(() => {
    mockV2AwsSend(responseMockSuccess, {
      MessageId: '1',
    } as AWS.SNS.Types.PublishResponse);
  });

  describe('publish', () => {
    it('topic arn', async () => {
      const sns = new AWSv2.SNS();

      await sns
        .publish({
          Message: 'sns message',
          TopicArn: fakeARN,
        })
        .promise();

      const publishSpans = getTestSpans().filter(
        (s: ReadableSpan) => s.name === `${topicName} send`
      );
      expect(publishSpans.length).toBe(1);

      const publishSpan = publishSpans[0];
      expect(
        publishSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION_KIND]
      ).toBe(MessagingDestinationKindValues.TOPIC);
      expect(
        publishSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION]
      ).toBe(topicName);
      expect(publishSpan.attributes[SemanticAttributes.RPC_METHOD]).toBe(
        'Publish'
      );
      expect(publishSpan.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toBe(
        'aws.sns'
      );
      expect(publishSpan.kind).toBe(SpanKind.PRODUCER);
    });

    it('phone number', async () => {
      const sns = new AWSv2.SNS();
      const PhoneNumber = 'my phone number';
      await sns
        .publish({
          Message: 'sns message',
          PhoneNumber,
        })
        .promise();

      const publishSpans = getTestSpans().filter(
        (s: ReadableSpan) => s.name === 'phone_number send'
      );
      expect(publishSpans.length).toBe(1);
      const publishSpan = publishSpans[0];
      expect(
        publishSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION]
      ).toBe(PhoneNumber);
    });

    it('inject context propagation', async () => {
      const sns = new AWSv2.SNS();
      const hookSpy = sinon.spy(
        (instrumentation['servicesExtensions'] as any)['services'].get('SNS'),
        'requestPostSpanHook'
      );

      await sns
        .publish({
          Message: 'sns message',
          TopicArn: fakeARN,
        })
        .promise();

      const publishSpans = getTestSpans().filter(
        (s: ReadableSpan) => s.name === `${topicName} send`
      );
      expect(publishSpans.length).toBe(1);
      expect(
        hookSpy.args[0][0].commandInput.MessageAttributes.traceparent
      ).toBeDefined();
    });
  });

  describe('createTopic', () => {
    it('basic createTopic creates a valid span', async () => {
      const sns = new AWSv2.SNS();

      const Name = 'my new topic';
      await sns.createTopic({ Name }).promise();

      const spans = getTestSpans();
      const createTopicSpans = spans.filter(
        (s: ReadableSpan) => s.name === 'SNS CreateTopic'
      );
      expect(createTopicSpans.length).toBe(1);

      const createTopicSpan = createTopicSpans[0];
      expect(
        createTopicSpan.attributes[
          SemanticAttributes.MESSAGING_DESTINATION_KIND
        ]
      ).toBeUndefined();
      expect(
        createTopicSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION]
      ).toBeUndefined();
      expect(createTopicSpan.kind).toBe(SpanKind.CLIENT);
    });
  });
});

describe('SNS - v3', () => {
  let sns: any;
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

  describe('publish', () => {
    it('topic arn', async () => {
      const topicV3Name = 'dummy-sns-v3-topic';
      await sns.publish({
        Message: 'sns message',
        TopicArn: `arn:aws:sns:us-east-1:000000000:${topicV3Name}`,
      });

      const publishSpans = getTestSpans().filter(
        (s: ReadableSpan) => s.name === `${topicV3Name} send`
      );
      expect(publishSpans.length).toBe(1);

      const publishSpan = publishSpans[0];
      expect(
        publishSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION_KIND]
      ).toBe(MessagingDestinationKindValues.TOPIC);
      expect(
        publishSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION]
      ).toBe(topicV3Name);
      expect(publishSpan.attributes[SemanticAttributes.RPC_METHOD]).toBe(
        'Publish'
      );
      expect(publishSpan.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toBe(
        'aws.sns'
      );
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
      expect(
        publishSpan.attributes[SemanticAttributes.MESSAGING_DESTINATION]
      ).toBe(PhoneNumber);
    });
  });
});
