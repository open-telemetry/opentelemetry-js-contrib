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
import './load-instrumentation';

import { AttributeNames } from '../src/enums';
import { DescribeStreamCommand, KinesisClient } from '@aws-sdk/client-kinesis';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import * as fs from 'fs';
import * as nock from 'nock';

import { SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { expect } from 'expect';

const region = 'us-east-1';

describe('Kinesis - v3', () => {
  describe('DescribeStream', () => {
    it('Request span attributes - adds Stream Name', async () => {
      const dummyStreamName = 'dummy-stream-name';

      nock(`https://kinesis.${region}.amazonaws.com`)
        .post('/')
        .reply(
          200,
          fs.readFileSync(
            './test/mock-responses/kinesis-describe-stream.json',
            'utf8'
          )
        );

      const params = {
        StreamName: dummyStreamName,
      };

      // Use NodeHttpHandler to use HTTP instead of HTTP2 because nock does not support HTTP2
      const client = new KinesisClient({
        region: region,
        requestHandler: new NodeHttpHandler(),
      });
      await client.send(new DescribeStreamCommand(params));

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
