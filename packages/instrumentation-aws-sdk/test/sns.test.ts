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
import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import { SNS as SNSv3 } from '@aws-sdk/client-sns';
import * as fs from 'fs';
import * as nock from 'nock';

import { expect } from 'expect';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  MESSAGINGDESTINATIONKINDVALUES_TOPIC,
  SEMATTRS_MESSAGING_DESTINATION,
  SEMATTRS_MESSAGING_DESTINATION_KIND,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_RPC_METHOD,
} from '@opentelemetry/semantic-conventions';
import { SpanKind } from '@opentelemetry/api';

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
      expect(publishSpan.attributes[SEMATTRS_MESSAGING_DESTINATION_KIND]).toBe(
        MESSAGINGDESTINATIONKINDVALUES_TOPIC
      );
      expect(publishSpan.attributes[SEMATTRS_MESSAGING_DESTINATION]).toBe(
        topicV3Name
      );
      expect(publishSpan.attributes['messaging.destination.name']).toBe(
        topicV3ARN
      );
      expect(publishSpan.attributes[SEMATTRS_RPC_METHOD]).toBe('Publish');
      expect(publishSpan.attributes[SEMATTRS_MESSAGING_SYSTEM]).toBe('aws.sns');
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
      expect(publishSpan.attributes[SEMATTRS_MESSAGING_DESTINATION]).toBe(
        PhoneNumber
      );
    });
  });
});
