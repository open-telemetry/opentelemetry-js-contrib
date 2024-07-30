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
import { _AWS_S3_BUCKET } from '../src/utils';

const region = 'us-east-1';

describe('S3', () => {
  let s3: AWS.S3;
  beforeEach(() => {
    AWS.config.credentials = {
      accessKeyId: 'test key id',
      expired: false,
      expireTime: new Date(),
      secretAccessKey: 'test acc key',
      sessionToken: 'test token',
    };
  });

  describe('ListObjects', () => {
    it('adds bucket Name', async () => {
      s3 = new AWS.S3({ region: region });
      const dummyBucketName = 'dummy-bucket-name';

      nock(`https://s3.${region}.amazonaws.com`).get('/').reply(200, 'null');

      await s3
        .listObjects(
          {
            Bucket: dummyBucketName,
          },
          (err: AWSError) => {
            expect(err).toBeFalsy();
          }
        )
        .promise();

      const testSpans = getTestSpans();
      console.log(testSpans.length);
      const creationSpans = testSpans.filter((s: ReadableSpan) => {
        return s.name === 'S3.ListObjects';
      });
      expect(creationSpans.length).toBe(1);
      const publishSpan = creationSpans[0];
      expect(publishSpan.attributes[_AWS_S3_BUCKET]).toBe(dummyBucketName);
      expect(publishSpan.kind).toBe(SpanKind.CLIENT);
    });
  });
});
