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

// Tests in this file originated from an earlier aws-sdk-v3.test.ts that
// covered multiple `client-*` packages. Its tests could be merged into
// sqs.test.ts.

import { AwsInstrumentation } from '../src';
import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
registerInstrumentationTesting(new AwsInstrumentation());

import { SQS } from '@aws-sdk/client-sqs';

// set aws environment variables, so tests in non aws environment are able to run
process.env.AWS_ACCESS_KEY_ID = 'testing';
process.env.AWS_SECRET_ACCESS_KEY = 'testing';

import 'mocha';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';
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
import { AttributeNames } from '../src/enums';
import { expect } from 'expect';
import * as fs from 'fs';
import * as nock from 'nock';

const region = 'us-east-1';

describe('instrumentation-aws-sdk-v3 (client-sqs)', () => {
  const sqsClient = new SQS({ region });

  it('sqs send add messaging attributes', async () => {
    nock(`https://sqs.${region}.amazonaws.com/`)
      .matchHeader('content-type', 'application/x-www-form-urlencoded')
      .post('/')
      .reply(
        200,
        fs.readFileSync('./test/mock-responses/sqs-send.xml', 'utf8')
      );
    // @aws-sdk/client-sqs >=3.446.0 uses a new JSON protocol.
    nock(`https://sqs.${region}.amazonaws.com/`)
      .matchHeader('content-type', 'application/x-amz-json-1.0')
      .post('/')
      .reply(
        200,
        fs.readFileSync('./test/mock-responses/sqs-send.json', 'utf8')
      );

    const params = {
      QueueUrl:
        'https://sqs.us-east-1.amazonaws.com/731241200085/otel-demo-aws-sdk',
      MessageBody: 'payload example from v3 without batch',
    };
    const response = await sqsClient.sendMessage(params);
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
      'otel-demo-aws-sdk'
    );
    expect(span.attributes[SEMATTRS_MESSAGING_URL]).toEqual(params.QueueUrl);
    expect(span.attributes[SEMATTRS_MESSAGING_MESSAGE_ID]).toEqual(
      response.MessageId
    );
    expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toEqual(200);
  });

  it('sqs send message batch attributes', async () => {
    nock(`https://sqs.${region}.amazonaws.com/`)
      .matchHeader('content-type', 'application/x-www-form-urlencoded')
      .post('/')
      .reply(
        200,
        fs.readFileSync('./test/mock-responses/sqs-send-batch.xml', 'utf8')
      );
    nock(`https://sqs.${region}.amazonaws.com/`)
      .matchHeader('content-type', 'application/x-amz-json-1.0')
      .post('/')
      .reply(
        200,
        fs.readFileSync('./test/mock-responses/sqs-send-batch.json', 'utf8')
      );

    const params = {
      QueueUrl:
        'https://sqs.us-east-1.amazonaws.com/731241200085/otel-demo-aws-sdk',
      MessageBody: 'payload example from v3 without batch',
      Entries: [
        {
          Id: '1000',
          MessageBody: 'msg body for 1000',
        },
        {
          Id: '1001',
          MessageBody: 'msg body for 1001',
        },
      ],
    };
    await sqsClient.sendMessageBatch(params);
    expect(getTestSpans().length).toBe(1);
    const [span] = getTestSpans();

    // make sure we have the general aws attributes:
    expect(span.attributes[SEMATTRS_RPC_SYSTEM]).toEqual('aws-api');
    expect(span.attributes[SEMATTRS_RPC_METHOD]).toEqual('SendMessageBatch');
    expect(span.attributes[SEMATTRS_RPC_SERVICE]).toEqual('SQS');
    expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);

    // messaging semantic attributes
    expect(span.attributes[SEMATTRS_MESSAGING_SYSTEM]).toEqual('aws.sqs');
    expect(span.attributes[SEMATTRS_MESSAGING_DESTINATION_KIND]).toEqual(
      MESSAGINGDESTINATIONKINDVALUES_QUEUE
    );
    expect(span.attributes[SEMATTRS_MESSAGING_DESTINATION]).toEqual(
      'otel-demo-aws-sdk'
    );
    expect(span.attributes[SEMATTRS_MESSAGING_URL]).toEqual(params.QueueUrl);
    expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toEqual(200);
  });

  it('sqs receive add messaging attributes', done => {
    nock(`https://sqs.${region}.amazonaws.com/`)
      .matchHeader('content-type', 'application/x-www-form-urlencoded')
      .post('/')
      .reply(
        200,
        fs.readFileSync('./test/mock-responses/sqs-receive.xml', 'utf8')
      );
    nock(`https://sqs.${region}.amazonaws.com/`)
      .matchHeader('content-type', 'application/x-amz-json-1.0')
      .post('/')
      .reply(
        200,
        fs.readFileSync('./test/mock-responses/sqs-receive.json', 'utf8')
      );

    const params = {
      QueueUrl:
        'https://sqs.us-east-1.amazonaws.com/731241200085/otel-demo-aws-sdk',
      MaxNumberOfMessages: 3,
    };
    sqsClient.receiveMessage(params).then(res => {
      expect(getTestSpans().length).toBe(1);
      const [span] = getTestSpans();

      // make sure we have the general aws attributes:
      expect(span.attributes[SEMATTRS_RPC_SYSTEM]).toEqual('aws-api');
      expect(span.attributes[SEMATTRS_RPC_METHOD]).toEqual('ReceiveMessage');
      expect(span.attributes[SEMATTRS_RPC_SERVICE]).toEqual('SQS');
      expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);
      expect(span.attributes[SEMATTRS_HTTP_STATUS_CODE]).toEqual(200);
      done();
    });
  });

  // Propagating span context to SQS ReceiveMessage promise handler is
  // broken with `@aws-sdk/client-sqs` v3.316.0 and later.
  // https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1477
  it.skip('sqs receive context', done => {
    nock(`https://sqs.${region}.amazonaws.com/`)
      .matchHeader('content-type', 'application/x-www-form-urlencoded')
      .post('/')
      .reply(
        200,
        fs.readFileSync('./test/mock-responses/sqs-receive.xml', 'utf8')
      );
    nock(`https://sqs.${region}.amazonaws.com/`)
      .matchHeader('content-type', 'application/x-amz-json-1.0')
      .post('/')
      .reply(
        200,
        fs.readFileSync('./test/mock-responses/sqs-receive.json', 'utf8')
      );

    const params = {
      QueueUrl:
        'https://sqs.us-east-1.amazonaws.com/731241200085/otel-demo-aws-sdk',
      MaxNumberOfMessages: 3,
    };
    sqsClient.receiveMessage(params).then(res => {
      const receiveCallbackSpan = trace.getSpan(context.active());
      expect(receiveCallbackSpan).toBeDefined();
      const attributes = (receiveCallbackSpan as unknown as ReadableSpan)
        .attributes;
      expect(attributes[SEMATTRS_MESSAGING_OPERATION]).toMatch(
        MESSAGINGOPERATIONVALUES_RECEIVE
      );
      done();
    });
  });
});
