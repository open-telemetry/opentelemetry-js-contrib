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
import { AwsInstrumentation, AwsSdkSqsProcessHookInformation } from '../src';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
const instrumentation = registerInstrumentationTesting(
  new AwsInstrumentation()
);
import * as AWS from 'aws-sdk';
// import { AWSError } from 'aws-sdk';

import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import {
  SpanStatusCode,
  Span,
} from '@opentelemetry/api';
// import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { mockV2AwsSend } from './testing-utils';
// import { Message } from 'aws-sdk/clients/sqs';
import * as expect from 'expect';

const responseMockSuccess = {
  requestId: '0000000000000',
  error: null,
};

describe('SNS', () => {
  before(() => {
    AWS.config.credentials = {
      accessKeyId: 'test key id',
      expired: false,
      expireTime: new Date(),
      secretAccessKey: 'test acc key',
      sessionToken: 'test token',
    };
  });

  beforeEach(() => {
    mockV2AwsSend(responseMockSuccess, {
      MessageId:'1'
  } as AWS.SNS.Types.PublishResponse);
  });


  describe('hooks', () => {
    it('snsProcessHook called and add message attribute to span', async () => {
      const config = {
        sqsProcessHook: (
          span: Span,
          sqsProcessInfo: AwsSdkSqsProcessHookInformation
        ) => {
          span.setAttribute(
            'attribute from sqs process hook',
            sqsProcessInfo.message.Body!
          );
        },
      };

      instrumentation.setConfig(config);

      const sqs = new AWS.SQS();
      const res = await sqs
        .receiveMessage({
          QueueUrl: 'queue/url/for/unittests',
        })
        .promise();
      res.Messages?.map(
        message => 'some mapping to create child process spans'
      );

      const processSpans = getTestSpans().filter(
        s => s.attributes[SemanticAttributes.MESSAGING_OPERATION] === 'process'
      );
      expect(processSpans.length).toBe(2);
      expect(
        processSpans[0].attributes['attribute from sqs process hook']
      ).toBe('msg 1 payload');
      expect(
        processSpans[1].attributes['attribute from sqs process hook']
      ).toBe('msg 2 payload');
    });

    it('sqsProcessHook not set in config', async () => {
      const sqs = new AWS.SQS();
      const res = await sqs
        .receiveMessage({
          QueueUrl: 'queue/url/for/unittests',
        })
        .promise();
      res.Messages?.map(
        message => 'some mapping to create child process spans'
      );
      const processSpans = getTestSpans().filter(
        s => s.attributes[SemanticAttributes.MESSAGING_OPERATION] === 'process'
      );
      expect(processSpans.length).toBe(2);
    });

    it('sqsProcessHook throws does not fail span', async () => {
      const config = {
        sqsProcessHook: (
          span: Span,
          sqsProcessInfo: AwsSdkSqsProcessHookInformation
        ) => {
          throw new Error('error from sqsProcessHook hook');
        },
      };
      instrumentation.setConfig(config);

      const sqs = new AWS.SQS();
      const res = await sqs
        .receiveMessage({
          QueueUrl: 'queue/url/for/unittests',
        })
        .promise();
      res.Messages?.map(
        message => 'some mapping to create child process spans'
      );

      const processSpans = getTestSpans().filter(
        s => s.attributes[SemanticAttributes.MESSAGING_OPERATION] === 'process'
      );
      expect(processSpans.length).toBe(2);
      expect(processSpans[0].status.code).toStrictEqual(SpanStatusCode.UNSET);
      expect(processSpans[1].status.code).toStrictEqual(SpanStatusCode.UNSET);
    });
  });
});
