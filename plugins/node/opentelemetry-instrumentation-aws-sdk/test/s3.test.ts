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
import { AttributeNames } from '../src/enums';
import './load-instrumentation';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as nock from 'nock';

import { SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { expect } from 'expect';

// set aws environment variables, so tests in non aws environment are able to run
process.env.AWS_ACCESS_KEY_ID = 'testing';
process.env.AWS_SECRET_ACCESS_KEY = 'testing';

const region = 'us-east-1';

describe('S3 - v3', () => {
  describe('PutObject', () => {
    it('Request span attributes - adds bucket Name', async () => {
      const dummyBucketName = 'ot-demo-test';

      nock(`https://${dummyBucketName}.s3.${region}.amazonaws.com/`)
        .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
        .reply(
          200,
          fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8')
        );

      const params = {
        Bucket: dummyBucketName,
        Key: 'aws-ot-s3-test-object.txt',
      };
      const client = new S3Client({ region });
      await client.send(new PutObjectCommand(params));

      const testSpans: ReadableSpan[] = getTestSpans();
      const listObjectsSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'S3.PutObject';
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
