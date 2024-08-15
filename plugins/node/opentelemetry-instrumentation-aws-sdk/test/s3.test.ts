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

import { S3 } from '@aws-sdk/client-s3';
import * as AWS from 'aws-sdk';
import { AWSError } from 'aws-sdk';
import * as nock from 'nock';

import { SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { expect } from 'expect';

const region = 'us-east-1';

describe('S3 - v2', () => {
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
      const listObjectsSpans = testSpans.filter((s: ReadableSpan) => {
        return s.name === 'S3.ListObjects';
      });
      expect(listObjectsSpans.length).toBe(1);
      const listObjectsSpan = listObjectsSpans[0];
      expect(listObjectsSpan.attributes[AttributeNames.AWS_S3_BUCKET]).toBe(
        dummyBucketName
      );
      expect(listObjectsSpan.kind).toBe(SpanKind.CLIENT);
    });
  });
});

describe('S3 - v3', () => {
  let s3: S3;
  beforeEach(() => {
    s3 = new S3({
      region: region,
      credentials: {
        accessKeyId: 'abcde',
        secretAccessKey: 'abcde',
      },
    });
  });

  describe('ListObjects', () => {
    it('adds bucket Name', async () => {
      const dummyBucketName = 'dummy-bucket-name';

      nock(`https://s3.${region}.amazonaws.com/`).post('/').reply(200, 'null');

      await s3
        .listObjects({
          Bucket: dummyBucketName,
        })
        .catch((err: any) => {});

      const testSpans: ReadableSpan[] = getTestSpans();
      const listObjectsSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'S3.ListObjects';
        }
      );
      expect(listObjectsSpans.length).toBe(1);
      const listObjectsSpan = listObjectsSpans[0];
      expect(listObjectsSpan.attributes[AttributeNames.AWS_S3_BUCKET]).toBe(
        dummyBucketName
      );
      expect(listObjectsSpan.kind).toBe(SpanKind.CLIENT);
    });
  });
});
