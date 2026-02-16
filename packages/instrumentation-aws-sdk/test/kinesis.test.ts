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
import {
  DescribeStreamCommand,
  KinesisClient,
  PutRecordCommand,
  PutRecordsCommand,
} from '@aws-sdk/client-kinesis';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import * as fs from 'fs';
import * as nock from 'nock';

import { SpanKind } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { expect } from 'expect';

const region = 'us-east-1';

describe('Kinesis - v3', () => {
  let client: KinesisClient;
  const dummyStreamName = 'dummy-stream-name';

  beforeEach(() => {
    client = new KinesisClient({
      region: region,
      requestHandler: new NodeHttpHandler(),
    });
  });

  describe('DescribeStream', () => {
    it('Request span attributes - adds Stream Name', async () => {
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

  describe('PutRecord', () => {
    it('injects trace context into JSON Data', async () => {
      nock(`https://kinesis.${region}.amazonaws.com`)
        .post('/')
        .reply(
          200,
          fs.readFileSync(
            './test/mock-responses/kinesis-put-record.json',
            'utf8'
          )
        );

      const payload = { message: 'hello' };
      const params = {
        StreamName: dummyStreamName,
        PartitionKey: 'pk-1',
        Data: new TextEncoder().encode(JSON.stringify(payload)),
      };

      await client.send(new PutRecordCommand(params));

      const testSpans: ReadableSpan[] = getTestSpans();
      const putRecordSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === `${dummyStreamName} send`;
        }
      );
      expect(putRecordSpans.length).toBe(1);
      const span = putRecordSpans[0];
      expect(span.kind).toBe(SpanKind.PRODUCER);
      expect(
        span.attributes[AttributeNames.AWS_KINESIS_STREAM_NAME]
      ).toBe(dummyStreamName);
      expect(span.attributes['messaging.system']).toBe('aws_kinesis');
      expect(span.attributes['messaging.destination.name']).toBe(
        dummyStreamName
      );

      // Verify trace context was injected into the Data payload
      const injectedData = JSON.parse(
        new TextDecoder().decode(params.Data)
      );
      expect(injectedData.message).toBe('hello');
      expect(injectedData.traceparent).toBeDefined();
      expect(typeof injectedData.traceparent).toBe('string');
    });

    it('extracts stream name from StreamARN', async () => {
      const endpoint = `https://kinesis.${region}.amazonaws.com`;
      nock(endpoint)
        .post('/')
        .reply(
          200,
          fs.readFileSync(
            './test/mock-responses/kinesis-put-record.json',
            'utf8'
          )
        );

      const arnClient = new KinesisClient({
        region: region,
        requestHandler: new NodeHttpHandler(),
        endpoint: endpoint,
      });

      const payload = { message: 'hello' };
      const params = {
        StreamARN: `arn:aws:kinesis:${region}:123456789012:stream/my-stream-from-arn`,
        PartitionKey: 'pk-1',
        Data: new TextEncoder().encode(JSON.stringify(payload)),
      };

      await arnClient.send(new PutRecordCommand(params));

      const testSpans: ReadableSpan[] = getTestSpans();
      const putRecordSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === 'my-stream-from-arn send';
        }
      );
      expect(putRecordSpans.length).toBe(1);
      const span = putRecordSpans[0];
      expect(span.kind).toBe(SpanKind.PRODUCER);
      expect(
        span.attributes[AttributeNames.AWS_KINESIS_STREAM_NAME]
      ).toBe('my-stream-from-arn');
      expect(span.attributes['messaging.destination.name']).toBe(
        'my-stream-from-arn'
      );
    });

    it('handles non-JSON data gracefully', async () => {
      nock(`https://kinesis.${region}.amazonaws.com`)
        .post('/')
        .reply(
          200,
          fs.readFileSync(
            './test/mock-responses/kinesis-put-record.json',
            'utf8'
          )
        );

      const nonJsonData = 'this is not json';
      const params = {
        StreamName: dummyStreamName,
        PartitionKey: 'pk-1',
        Data: new TextEncoder().encode(nonJsonData),
      };

      await client.send(new PutRecordCommand(params));

      const testSpans: ReadableSpan[] = getTestSpans();
      const putRecordSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === `${dummyStreamName} send`;
        }
      );
      expect(putRecordSpans.length).toBe(1);
      const span = putRecordSpans[0];
      expect(span.kind).toBe(SpanKind.PRODUCER);

      // Data should remain unchanged since it's not valid JSON
      const resultData = new TextDecoder().decode(params.Data);
      expect(resultData).toBe(nonJsonData);
    });
  });

  describe('PutRecords', () => {
    it('injects trace context into all records', async () => {
      nock(`https://kinesis.${region}.amazonaws.com`)
        .post('/')
        .reply(
          200,
          fs.readFileSync(
            './test/mock-responses/kinesis-put-records.json',
            'utf8'
          )
        );

      const records = [
        {
          Data: new TextEncoder().encode(JSON.stringify({ id: 1 })),
          PartitionKey: 'pk-1',
        },
        {
          Data: new TextEncoder().encode(JSON.stringify({ id: 2 })),
          PartitionKey: 'pk-2',
        },
      ];

      const params = {
        StreamName: dummyStreamName,
        Records: records,
      };

      await client.send(new PutRecordsCommand(params));

      const testSpans: ReadableSpan[] = getTestSpans();
      const putRecordsSpans: ReadableSpan[] = testSpans.filter(
        (s: ReadableSpan) => {
          return s.name === `${dummyStreamName} send`;
        }
      );
      expect(putRecordsSpans.length).toBe(1);
      const span = putRecordsSpans[0];
      expect(span.kind).toBe(SpanKind.PRODUCER);
      expect(
        span.attributes[AttributeNames.AWS_KINESIS_STREAM_NAME]
      ).toBe(dummyStreamName);
      expect(span.attributes['messaging.system']).toBe('aws_kinesis');
      expect(span.attributes['messaging.destination.name']).toBe(
        dummyStreamName
      );

      // Verify trace context was injected into all records
      for (const record of records) {
        const injectedData = JSON.parse(
          new TextDecoder().decode(record.Data)
        );
        expect(injectedData.traceparent).toBeDefined();
        expect(typeof injectedData.traceparent).toBe('string');
      }

      // Verify original data is preserved
      const firstRecord = JSON.parse(
        new TextDecoder().decode(records[0].Data)
      );
      expect(firstRecord.id).toBe(1);
      const secondRecord = JSON.parse(
        new TextDecoder().decode(records[1].Data)
      );
      expect(secondRecord.id).toBe(2);
    });
  });
});
