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

import {
  getTestSpans,
  registerInstrumentationTesting,
} from '@opentelemetry/contrib-test-utils';
import { AwsInstrumentation } from '../src';
registerInstrumentationTesting(new AwsInstrumentation());

import * as AWS from 'aws-sdk';
import { AWSError } from 'aws-sdk';
import * as nock from 'nock';

import { SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { expect } from 'expect';
import { _AWS_KINESIS_STREAM_NAME } from '../src/utils';

const region = 'us-east-1';

describe('Kinesis', () => {
  let kinesis: AWS.Kinesis;
  beforeEach(() => {
    AWS.config.credentials = {
      accessKeyId: 'test key id',
      expired: false,
      expireTime: new Date(),
      secretAccessKey: 'test acc key',
      sessionToken: 'test token',
    };
  });

  describe('CreateStream', () => {
    it('adds Stream Name', async () => {
      kinesis = new AWS.Kinesis({ region: region });
      const dummyStreamName = 'dummy-stream-name';

      nock(`https://kinesis.${region}.amazonaws.com`)
        .get('/')
        .reply(200, 'null');

      await kinesis
        .createStream(
          {
            StreamName: dummyStreamName,
            ShardCount: 3,
          },
          (err: AWSError) => {
            expect(err).toBeFalsy();
          }
        )
        .promise();

      const testSpans = getTestSpans();
      const creationSpans = testSpans.filter((s: ReadableSpan) => {
        return s.name === 'Kinesis.CreateStream';
      });
      expect(creationSpans.length).toBe(1);
      const creationSpan = creationSpans[0];
      expect(creationSpan.attributes[_AWS_KINESIS_STREAM_NAME]).toBe(
        dummyStreamName
      );
      expect(creationSpan.kind).toBe(SpanKind.CLIENT);
    });
  });
});
