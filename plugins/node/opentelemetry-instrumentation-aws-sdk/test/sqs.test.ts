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

import {
  MessagingDestinationKindValues,
  MessagingOperationValues,
  SemanticAttributes,
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
import * as expect from 'expect';
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

  describe('process spans', () => {
    let receivedMessages: Message[];

    const createProcessChildSpan = (msgContext: any) => {
      const processChildSpan = trace
        .getTracerProvider()
        .getTracer('default')
        .startSpan(`child span of sqs processing span of msg ${msgContext}`);
      processChildSpan.end();
    };

    const expectReceiver2ProcessWithNChildrenEach = (
      spans: ReadableSpan[],
      numChildPerProcessSpan: number
    ) => {
      const awsReceiveSpan = spans.filter(
        s =>
          s.attributes[SemanticAttributes.MESSAGING_OPERATION] ===
          MessagingOperationValues.RECEIVE
      );
      expect(awsReceiveSpan.length).toBe(1);

      const processSpans = spans.filter(
        s =>
          s.attributes[SemanticAttributes.MESSAGING_OPERATION] ===
          MessagingOperationValues.PROCESS
      );
      expect(processSpans.length).toBe(2);
      expect(processSpans[0].parentSpanId).toStrictEqual(
        awsReceiveSpan[0].spanContext().spanId
      );
      expect(processSpans[1].parentSpanId).toStrictEqual(
        awsReceiveSpan[0].spanContext().spanId
      );

      const processChildSpans = spans.filter(s => s.kind === SpanKind.INTERNAL);
      expect(processChildSpans.length).toBe(2 * numChildPerProcessSpan);
      for (let i = 0; i < numChildPerProcessSpan; i++) {
        expect(processChildSpans[2 * i + 0].parentSpanId).toStrictEqual(
          processSpans[0].spanContext().spanId
        );
        expect(processChildSpans[2 * i + 1].parentSpanId).toStrictEqual(
          processSpans[1].spanContext().spanId
        );
      }
    };

    const expectReceiver2ProcessWith1ChildEach = (spans: ReadableSpan[]) => {
      expectReceiver2ProcessWithNChildrenEach(spans, 1);
    };

    const expectReceiver2ProcessWith2ChildEach = (spans: ReadableSpan[]) => {
      expectReceiver2ProcessWithNChildrenEach(spans, 2);
    };

    const contextKeyFromTest = Symbol('context key from test');
    const contextValueFromTest = 'context value from test';

    beforeEach(async () => {
      const sqs = new AWS.SQS();
      await context.with(
        context.active().setValue(contextKeyFromTest, contextValueFromTest),
        async () => {
          const res = await sqs
            .receiveMessage({
              QueueUrl: 'queue/url/for/unittests',
            })
            .promise();
          receivedMessages = res.Messages!;
        }
      );
    });

    it('should create processing child with forEach', async () => {
      receivedMessages.forEach(msg => {
        createProcessChildSpan(msg.Body);
      });
      expectReceiver2ProcessWith1ChildEach(getTestSpans());
    });

    it('should create processing child with map', async () => {
      receivedMessages.map(msg => {
        createProcessChildSpan(msg.Body);
      });
      expectReceiver2ProcessWith1ChildEach(getTestSpans());
    });

    it('should not fail when mapping to non-object type', async () => {
      receivedMessages
        .map(msg => 'map result is string')
        .map(s => 'some other string');
    });

    it('should not fail when mapping to undefined type', async () => {
      receivedMessages.map(msg => undefined).map(s => 'some other string');
    });

    it('should create one processing child when throws in map', async () => {
      try {
        receivedMessages.map(msg => {
          createProcessChildSpan(msg.Body);
          throw Error('error from array.map');
        });
      } catch (err) {}

      const processChildSpans = getTestSpans().filter(
        s => s.kind === SpanKind.INTERNAL
      );
      expect(processChildSpans.length).toBe(1);
    });

    it('should create processing child with two forEach', async () => {
      receivedMessages.forEach(msg => {
        createProcessChildSpan(msg.Body);
      });
      receivedMessages.forEach(msg => {
        createProcessChildSpan(msg.Body);
      });
      expectReceiver2ProcessWith2ChildEach(getTestSpans());
    });

    it('should forward all parameters to forEach callback', async () => {
      const objectForThis = {};
      receivedMessages.forEach(function (this: any, msg, index, array) {
        expect(msg).not.toBeUndefined();
        expect(index).toBeLessThan(2);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(array).toBe(receivedMessages);
        expect(this).toBe(objectForThis);
      }, objectForThis);
    });

    it('should create one processing child with forEach that throws', async () => {
      try {
        receivedMessages.forEach(msg => {
          createProcessChildSpan(msg.Body);
          throw Error('error from forEach');
        });
      } catch (err) {}
      const processChildSpans = getTestSpans().filter(
        s => s.kind === SpanKind.INTERNAL
      );
      expect(processChildSpans.length).toBe(1);
    });

    it.skip('should create processing child with array index access', async () => {
      for (let i = 0; i < receivedMessages.length; i++) {
        const msg = receivedMessages[i];
        createProcessChildSpan(msg.Body);
      }
      expectReceiver2ProcessWith1ChildEach(getTestSpans());
    });

    it('should create processing child with map and forEach calls', async () => {
      receivedMessages
        .map(msg => ({ payload: msg.Body }))
        .forEach(msgBody => {
          createProcessChildSpan(msgBody);
        });
      expectReceiver2ProcessWith1ChildEach(getTestSpans());
    });

    it('should create processing child with filter and forEach', async () => {
      receivedMessages
        .filter(msg => msg)
        .forEach(msgBody => {
          createProcessChildSpan(msgBody);
        });
      expectReceiver2ProcessWith1ChildEach(getTestSpans());
    });

    it.skip('should create processing child with for(msg of messages)', () => {
      for (const msg of receivedMessages) {
        createProcessChildSpan(msg.Body);
      }
      expectReceiver2ProcessWith1ChildEach(getTestSpans());
    });

    it.skip('should create processing child with array.values() for loop', () => {
      for (const msg of receivedMessages.values()) {
        createProcessChildSpan(msg.Body);
      }
      expectReceiver2ProcessWith1ChildEach(getTestSpans());
    });

    it.skip('should create processing child with array.values() for loop and awaits in process', async () => {
      for (const msg of receivedMessages.values()) {
        await new Promise(resolve => setImmediate(resolve));
        createProcessChildSpan(msg.Body);
      }
      expectReceiver2ProcessWith1ChildEach(getTestSpans());
    });

    it('should propagate the context of the receive call in process spans loop', async () => {
      receivedMessages.forEach(() => {
        expect(context.active().getValue(contextKeyFromTest)).toStrictEqual(
          contextValueFromTest
        );
      });
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
      expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual('aws-api');
      expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
        'SendMessage'
      );
      expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual('SQS');
      expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);

      // custom messaging attributes
      expect(span.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual(
        'aws.sqs'
      );
      expect(
        span.attributes[SemanticAttributes.MESSAGING_DESTINATION_KIND]
      ).toEqual(MessagingDestinationKindValues.QUEUE);
      expect(span.attributes[SemanticAttributes.MESSAGING_DESTINATION]).toEqual(
        QueueName
      );
      expect(span.attributes[SemanticAttributes.MESSAGING_URL]).toEqual(
        params.QueueUrl
      );
      expect(span.attributes[SemanticAttributes.MESSAGING_MESSAGE_ID]).toEqual(
        response.MessageId
      );
      expect(span.attributes[SemanticAttributes.HTTP_STATUS_CODE]).toEqual(200);
    });

    it('sqsProcessHook called and add message attribute to span', async () => {
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
        s =>
          s.attributes[SemanticAttributes.MESSAGING_OPERATION] ===
          MessagingOperationValues.PROCESS
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
        s =>
          s.attributes[SemanticAttributes.MESSAGING_OPERATION] ===
          MessagingOperationValues.PROCESS
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
        s =>
          s.attributes[SemanticAttributes.MESSAGING_OPERATION] ===
          MessagingOperationValues.PROCESS
      );
      expect(processSpans.length).toBe(2);
      expect(processSpans[0].status.code).toStrictEqual(SpanStatusCode.UNSET);
      expect(processSpans[1].status.code).toStrictEqual(SpanStatusCode.UNSET);
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
