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
import { AWSError } from 'aws-sdk';
import type { SQS } from 'aws-sdk';

import {
  MESSAGINGDESTINATIONKINDVALUES_QUEUE,
  MESSAGINGOPERATIONVALUES_RECEIVE,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_MESSAGING_DESTINATION,
  SEMATTRS_MESSAGING_DESTINATION_KIND,
  SEMATTRS_MESSAGING_MESSAGE_ID,
  SEMATTRS_MESSAGING_OPERATION,
  SEMATTRS_MESSAGING_SYSTEM,
  SEMATTRS_MESSAGING_URL,
  SEMATTRS_RPC_METHOD,
  SEMATTRS_RPC_SERVICE,
  SEMATTRS_RPC_SYSTEM,
} from '@opentelemetry/semantic-conventions';
import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  Span,
} from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { mockV2AwsSend } from './testing-utils';
import { Message } from 'aws-sdk/clients/sqs';
import { expect } from 'expect';
import * as sinon from 'sinon';
import * as messageAttributes from '../src/services/MessageAttributes';
import { AttributeNames } from '../src/enums';

const responseMockSuccess = {
  requestId: '0000000000000',
  error: null,
  httpResponse: { statusCode: 200 },
} as AWS.Response<any, any>;

const extractContextSpy = sinon.spy(
  messageAttributes,
  'extractPropagationContext'
);

describe('SQS', () => {
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
      Messages: [{ Body: 'msg 1 payload' }, { Body: 'msg 2 payload' }],
    } as AWS.SQS.Types.ReceiveMessageResult);
  });

  describe('receive context', () => {
    const createReceiveChildSpan = () => {
      const childSpan = trace
        .getTracerProvider()
        .getTracer('default')
        .startSpan('child span of SQS.ReceiveMessage');
      childSpan.end();
    };

    const expectReceiverWithChildSpan = (spans: ReadableSpan[]) => {
      const awsReceiveSpan = spans.filter(s => s.kind === SpanKind.CONSUMER);
      expect(awsReceiveSpan.length).toBe(1);
      const internalSpan = spans.filter(s => s.kind === SpanKind.INTERNAL);
      expect(internalSpan.length).toBe(1);
      expect(internalSpan[0].parentSpanId).toStrictEqual(
        awsReceiveSpan[0].spanContext().spanId
      );
    };

    it('should set parent context in sqs receive callback', done => {
      const sqs = new AWS.SQS();
      sqs.receiveMessage(
        {
          QueueUrl: 'queue/url/for/unittests',
        },
        (err: AWSError, data: AWS.SQS.Types.ReceiveMessageResult) => {
          expect(err).toBeFalsy();
          createReceiveChildSpan();
          expectReceiverWithChildSpan(getTestSpans());
          done();
        }
      );
    });

    it("should set parent context in sqs receive 'send' callback", done => {
      const sqs = new AWS.SQS();
      sqs
        .receiveMessage({
          QueueUrl: 'queue/url/for/unittests',
        })
        .send((err: AWSError, data: AWS.SQS.Types.ReceiveMessageResult) => {
          expect(err).toBeFalsy();
          createReceiveChildSpan();
          expectReceiverWithChildSpan(getTestSpans());
          done();
        });
    });

    it('should set parent context in sqs receive promise then', async () => {
      const sqs = new AWS.SQS();
      await sqs
        .receiveMessage({
          QueueUrl: 'queue/url/for/unittests',
        })
        .promise()
        .then(() => {
          createReceiveChildSpan();
          expectReceiverWithChildSpan(getTestSpans());
        });
    });

    it.skip('should set parent context in sqs receive after await', async () => {
      const sqs = new AWS.SQS();
      await sqs
        .receiveMessage({
          QueueUrl: 'queue/url/for/unittests',
        })
        .promise();

      createReceiveChildSpan();
      expectReceiverWithChildSpan(getTestSpans());
    });

    it.skip('should set parent context in sqs receive from async function', async () => {
      const asycnReceive = async () => {
        const sqs = new AWS.SQS();
        return await sqs
          .receiveMessage({
            QueueUrl: 'queue/url/for/unittests',
          })
          .promise();
      };

      await asycnReceive();
      createReceiveChildSpan();
      expectReceiverWithChildSpan(getTestSpans());
    });
  });

  describe('hooks', () => {
    it('sqsResponseHook for sendMessage should add messaging attributes', async () => {
      const region = 'us-east-1';
      const sqs = new AWS.SQS();
      sqs.config.update({ region });

      const QueueName = 'unittest';
      const params = {
        QueueUrl: `queue/url/for/${QueueName}`,
        MessageBody: 'payload example from v2 without batch',
      };

      const response = await sqs.sendMessage(params).promise();

      expect(getTestSpans().length).toBe(1);
      const [span] = getTestSpans();

      // make sure we have the general aws attributes:
      expect(span.attributes[SEMATTRS_RPC_SYSTEM]).toEqual('aws-api');
      expect(span.attributes[SEMATTRS_RPC_METHOD]).toEqual('SendMessage');
      expect(span.attributes[SEMATTRS_RPC_SERVICE]).toEqual('SQS');
      expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);

      // custom messaging attributes
      expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toEqual('aws.sqs');
      expect(span.attributes[SEMATTRS_MESSAGING_DESTINATION_KIND]).toEqual(
        MESSAGINGDESTINATIONKINDVALUES_QUEUE
      );
      expect(span.attributes[SEMATTRS_MESSAGING_DESTINATION]).toEqual(
        QueueName
      );
      expect(span.attributes[SEMATTRS_MESSAGING_URL]).toEqual(params.QueueUrl);
      expect(span.attributes[SEMATTRS_MESSAGING_MESSAGE_ID]).toEqual(
        response.MessageId
      );
      expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toEqual(200);
    });

    it('bogus sendMessageBatch input should not crash', async () => {
      const region = 'us-east-1';
      const sqs = new AWS.SQS();
      sqs.config.update({ region });

      const QueueName = 'unittest';
      const params = {
        QueueUrl: `queue/url/for/${QueueName}`,
        Entries: { Key1: { MessageBody: 'This is the first message' } },
      };
      await sqs
        .sendMessageBatch(params as unknown as SQS.SendMessageBatchRequest)
        .promise();

      const spans = getTestSpans();
      expect(spans.length).toBe(1);

      // Spot check a single attribute as a sanity check.
      expect(spans[0].attributes[SEMATTRS_RPC_METHOD]).toEqual(
        'SendMessageBatch'
      );
    });
  });

  describe('extract payload', () => {
    beforeEach(() => {
      extractContextSpy.resetHistory();
    });
    it('should not extract from payload even if set', async () => {
      mockV2AwsSend(responseMockSuccess, {
        Messages: [{ Body: JSON.stringify({ traceparent: 1 }) }],
      } as AWS.SQS.Types.ReceiveMessageResult);

      const sqs = new AWS.SQS();
      await sqs
        .receiveMessage({
          QueueUrl: 'queue/url/for/unittests1',
        })
        .promise();
      expect(extractContextSpy.returnValues[0]?.traceparent).toBeUndefined();
    });

    it('should extract from payload', async () => {
      const traceparent = {
        traceparent: {
          Value: '00-a1d050b7c8ad93c405e7a0d94cda5b03-23a485dc98b24027-01',
          Type: 'String',
        },
      };
      instrumentation.setConfig({
        sqsExtractContextPropagationFromPayload: true,
      });
      mockV2AwsSend(responseMockSuccess, {
        Messages: [
          { Body: JSON.stringify({ MessageAttributes: { traceparent } }) },
        ],
      } as AWS.SQS.Types.ReceiveMessageResult);

      const sqs = new AWS.SQS();
      await sqs
        .receiveMessage({
          QueueUrl: 'queue/url/for/unittests',
        })
        .promise();
      expect(extractContextSpy.returnValues[0]?.traceparent).toStrictEqual(
        traceparent
      );
    });

    it('should not extract from payload but from attributes', async () => {
      const traceparentInPayload = 'some-trace-parent-value';
      const traceparentInMessageAttributes = {
        traceparent: {
          StringValue:
            '00-a1d050b7c8ad93c405e7a0d94cda5b03-23a485dc98b24027-01',
          DataType: 'String',
        },
      };
      instrumentation.setConfig({
        sqsExtractContextPropagationFromPayload: false,
      });
      mockV2AwsSend(responseMockSuccess, {
        Messages: [
          {
            MessageAttributes: traceparentInMessageAttributes,
            Body: JSON.stringify({
              MessageAttributes: { traceparentInPayload },
            }),
          },
        ],
      } as AWS.SQS.Types.ReceiveMessageResult);

      const sqs = new AWS.SQS();
      await sqs
        .receiveMessage({
          QueueUrl: 'queue/url/for/unittests',
        })
        .promise();

      expect(extractContextSpy.returnValues[0]).toBe(
        traceparentInMessageAttributes
      );
    });
  });
});
