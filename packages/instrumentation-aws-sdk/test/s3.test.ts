/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getTestSpans } from '@opentelemetry/contrib-test-utils';
import { AttributeNames } from '../src/enums';
import { ATTR_AWS_S3_KEY } from '../src/semconv';
import './load-instrumentation';

import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as nock from 'nock';

import { SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace';
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

    it('Request span attributes - adds the object key', async () => {
      nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
        .put('/aws-ot-s3-test-object.txt?x-id=PutObject')
        .reply(
          200,
          fs.readFileSync('./test/mock-responses/s3-put-object.xml', 'utf8')
        );

      const client = new S3Client({ region });
      await client.send(
        new PutObjectCommand({
          Bucket: 'ot-demo-test',
          Key: 'aws-ot-s3-test-object.txt',
        })
      );

      const [span] = getTestSpans().filter(s => s.name === 'S3.PutObject');
      expect(span.attributes[ATTR_AWS_S3_KEY]).toBe(
        'aws-ot-s3-test-object.txt'
      );
    });
  });

  describe('ListObjectsV2', () => {
    it('Request span attributes - no object key on a bucket operation', async () => {
      nock(`https://ot-demo-test.s3.${region}.amazonaws.com/`)
        .get('/')
        .query(true)
        .reply(
          200,
          '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>ot-demo-test</Name><KeyCount>0</KeyCount></ListBucketResult>'
        );

      const client = new S3Client({ region });
      await client.send(new ListObjectsV2Command({ Bucket: 'ot-demo-test' }));

      const [span] = getTestSpans().filter(s => s.name === 'S3.ListObjectsV2');
      expect(span.attributes[AttributeNames.AWS_S3_BUCKET]).toBe(
        'ot-demo-test'
      );
      expect(span.attributes).not.toHaveProperty(ATTR_AWS_S3_KEY);
    });
  });
});
