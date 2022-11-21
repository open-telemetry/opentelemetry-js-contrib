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
import * as AWS from 'aws-sdk';

import {
  MessagingDestinationKindValues,
  SemanticAttributes,
} from '@opentelemetry/semantic-conventions';

import { mockV2AwsSend } from './testing-utils';
import * as expect from 'expect';
import * as sinon from 'sinon';
import { AttributeNames } from '../src/enums';

const responseMockSuccess = {
  requestId: '0000000000000',
  error: null,
  httpResponse: { statusCode: 200 },
} as AWS.Response<any, any>;

describe('Event Bridge', () => {
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

  describe('hooks', () => {
    const Entry: AWS.EventBridge.PutEventsRequestEntry = {
      Detail: 'detail',
      DetailType: 'detailType',
      Source: 'Src',
    };

    it('eventBridgeResponseHook for putEvents should add messaging attributes', async () => {
      const region = 'us-east-1';
      const eb = new AWS.EventBridge();
      eb.config.update({ region });

      await eb
        .putEvents({
          Entries: [Entry],
        })
        .promise();

      expect(getTestSpans().length).toBe(1);
      const [span] = getTestSpans();

      // make sure we have the general aws attributes:
      expect(span.attributes[SemanticAttributes.RPC_SYSTEM]).toEqual('aws-api');
      expect(span.attributes[SemanticAttributes.RPC_METHOD]).toEqual(
        'PutEvents'
      );
      expect(span.attributes[SemanticAttributes.RPC_SERVICE]).toEqual(
        'EventBridge'
      );
      expect(span.attributes[AttributeNames.AWS_REGION]).toEqual(region);

      // custom messaging attributes
      expect(span.attributes[SemanticAttributes.MESSAGING_SYSTEM]).toEqual(
        'aws.eventbridge'
      );
      expect(
        span.attributes[SemanticAttributes.MESSAGING_DESTINATION_KIND]
      ).toEqual(MessagingDestinationKindValues.TOPIC);

      expect(span.attributes[SemanticAttributes.HTTP_STATUS_CODE]).toEqual(200);
    });

    it('inject context propagation', async () => {
      const eb = new AWS.EventBridge();
      const hookSpy = sinon.spy(
        (instrumentation['servicesExtensions'] as any)['services'].get(
          'EventBridge'
        ),
        'requestPostSpanHook'
      );

      await eb
        .putEvents({
          Entries: [Entry],
        })
        .promise();

      const publishSpans = getTestSpans();
      expect(publishSpans.length).toBe(1);
      expect(
        hookSpy.args[0][0].commandInput.Entries[0].TraceHeader
      ).toBeDefined();
    });
  });
});
