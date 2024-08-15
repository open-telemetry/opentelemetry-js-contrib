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
import { AttributeNames } from '../src/enums';
registerInstrumentationTesting(new AwsInstrumentation());

import { Kinesis } from '@aws-sdk/client-kinesis';
import * as AWS from 'aws-sdk';
import { AWSError } from 'aws-sdk';
import * as nock from 'nock';

import { SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { expect } from 'expect';

const region = 'us-east-1';

describe('Kinesis - v2', () => {
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

  describe('DescribeStream', () => {
    it('adds Stream Name', async () => {
      kinesis = new AWS.Kinesis({ region: region });
      const dummyStreamName = 'dummy-stream-name';

      nock(`https://kinesis.${region}.amazonaws.com`)
        .get('/')
        .reply(200, 'null');

      await kinesis
        .describeStream(
          {
            StreamName: dummyStreamName,
          },
          (err: AWSError) => {
            expect(err).toBeFalsy();
          }
        )
        .promise();

      const testSpans = getTestSpans();
      const describeSpans = testSpans.filter((s: ReadableSpan) => {
        return s.name === 'Kinesis.DescribeStream';
      });
      expect(describeSpans.length).toBe(1);
      const describeSpan = describeSpans[0];
      expect(
        describeSpan.attributes[AttributeNames.AWS_KINESIS_STREAM_NAME]
      ).toBe(dummyStreamName);
      expect(describeSpan.kind).toBe(SpanKind.CLIENT);
    });
  });
});

describe('Kinesis - v3', () => {
  let kinesis: Kinesis;
  beforeEach(() => {
    kinesis = new Kinesis({
      region: region,
      credentials: {
        accessKeyId: 'abcde',
        secretAccessKey: 'abcde',
      },
    });
  });

  describe('DescribeStream', () => {
    it('adds Stream Name', async () => {
      const dummyStreamName = 'dummy-stream-name';

      nock(`https://kinesis.${region}.amazonaws.com/`).post('/').reply(200, {});

      await kinesis
        .describeStream({
          StreamName: dummyStreamName,
        })
        .catch((err: any) => {});

      const testSpans: ReadableSpan[] = getTestSpans();
      const describeSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'Kinesis.DescribeStream';
        }
      );
      expect(describeSpans.length).toBe(1);
      const describeSpan = describeSpans[0];
      expect(
        describeSpan.attributes[AttributeNames.AWS_KINESIS_STREAM_NAME]
      ).toBe(dummyStreamName);
      expect(describeSpan.kind).toBe(SpanKind.CLIENT);
    });
  });
});
