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

// We access through node_modules to allow it to be patched.
/* eslint-disable node/no-extraneous-require */

import * as path from 'path';

import {
  AwsLambdaInstrumentation,
  AwsLambdaInstrumentationConfig,
} from '../../src';
import {
  BatchSpanProcessor,
  InMemorySpanExporter,
  ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Context, SQSEvent } from 'aws-lambda';
import * as assert from 'assert';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import {
  defaultTextMapSetter,
  ROOT_CONTEXT,
  SpanContext,
  SpanKind,
  SpanStatusCode,
  trace,
  TraceFlags,
} from '@opentelemetry/api';
import { assertSpanSuccess } from './lambda-handler.test';
import { SQSRecord } from 'aws-lambda/trigger/sqs';
import {
  AWSXRAY_TRACE_ID_HEADER,
  AWSXRayPropagator,
} from '@opentelemetry/propagator-aws-xray';

const awsPropagator = new AWSXRayPropagator();
const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new BatchSpanProcessor(memoryExporter));
provider.register();

/*
  example from https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
 */
const fifoMessage: SQSRecord = {
  messageId: '11d6ee51-4cc7-4302-9e22-7cd8afdaadf5',
  receiptHandle: 'AQEBBX8nesZEXmkhsmZeyIE8iQAMig7qw...',
  body: 'Test message.',
  attributes: {
    ApproximateReceiveCount: '1',
    SentTimestamp: '1573251510774',
    SequenceNumber: '18849496460467696128',
    MessageGroupId: '1',
    SenderId: 'AIDAIO23YVJENQZJOL4VO',
    MessageDeduplicationId: '1',
    ApproximateFirstReceiveTimestamp: '1573251510774',
  },
  messageAttributes: {},
  md5OfBody: 'e4e68fb7bd0e697a0ae8f1bb342846b3',
  eventSource: 'aws:sqs',
  eventSourceARN: 'arn:aws:sqs:us-east-2:123456789012:fifo.fifo',
  awsRegion: 'us-east-2',
};

const sqsRecord1: SQSRecord = {
  messageId: '059f36b4-87a3-44ab-83d2-661975830a7d',
  receiptHandle: 'AQEBwJnKyrHigUMZj6rYigCgxlaS3SLy0a...',
  body: 'Test message.',
  attributes: {
    ApproximateReceiveCount: '1',
    SentTimestamp: '1545082649183',
    SenderId: 'AIDAIENQZJOLO23YVJ4VO',
    ApproximateFirstReceiveTimestamp: '1545082649185',
  },
  messageAttributes: {},
  md5OfBody: 'e4e68fb7bd0e697a0ae8f1bb342846b3',
  eventSource: 'aws:sqs',
  eventSourceARN: 'arn:aws:sqs:us-east-2:123456789012:my-queue',
  awsRegion: 'us-east-2',
};

const sqsRecord2: SQSRecord = {
  messageId: '2e1424d4-f796-459a-8184-9c92662be6da',
  receiptHandle: 'AQEBzWwaftRI0KuVm4tP+/7q1rGgNqicHq...',
  body: 'Test message.',
  attributes: {
    ApproximateReceiveCount: '1',
    SentTimestamp: '1545082650636',
    SenderId: 'AIDAIENQZJOLO23YVJ4VO',
    ApproximateFirstReceiveTimestamp: '1545082650649',
  },
  messageAttributes: {},
  md5OfBody: 'e4e68fb7bd0e697a0ae8f1bb342846b3',
  eventSource: 'aws:sqs',
  eventSourceARN: 'arn:aws:sqs:us-east-2:123456789012:my-queue',
  awsRegion: 'us-east-2',
};

// xray context propagation
const TRACE_ID = '8a3c60f7d188f8fa79d48a391a778fa6';
const SPAN_ID = '53995c3f42cd8ad8';
const SAMPLED_TRACE_FLAG = TraceFlags.SAMPLED;
const linkContext: SpanContext = {
  traceId: TRACE_ID,
  spanId: SPAN_ID,
  traceFlags: SAMPLED_TRACE_FLAG,
  isRemote: true,
};

const carrier: { [key: string]: string } = {};

awsPropagator.inject(
  trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(linkContext)),
  carrier,
  defaultTextMapSetter
);

const AWSTraceHeader = carrier[AWSXRAY_TRACE_ID_HEADER];

const sqsRecordWithLink: SQSRecord = {
  ...sqsRecord1,
  attributes: { ...sqsRecord1.attributes, AWSTraceHeader },
};

const assertSQSEventSpan = (span: ReadableSpan, sourceName?: string) => {
  assert.strictEqual(span.kind, SpanKind.CONSUMER);

  assert.strictEqual(
    span.attributes[SemanticAttributes.MESSAGING_OPERATION],
    'process'
  );
  assert.strictEqual(
    span.attributes[SemanticAttributes.MESSAGING_SYSTEM],
    'AmazonSQS'
  );

  assert.strictEqual(span.attributes['messaging.source.kind'], 'queue');
  if (sourceName) {
    assert.strictEqual(span.name, `${sourceName} process`);
    assert.strictEqual(span.attributes['messaging.source.name'], sourceName);
  }
};

const assertSQSEventSpanSuccess = (span: ReadableSpan, sourceName?: string) => {
  assertSQSEventSpan(span, sourceName);
  assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
  assert.strictEqual(span.status.message, undefined);
};

const assertSQSEventSpanFailure = (span: ReadableSpan, sourceName?: string) => {
  assertSQSEventSpan(span, sourceName);
  assert.strictEqual(span.status.code, SpanStatusCode.ERROR);
  assert.strictEqual(span.status.message, 'handler error');
};

describe('SQS handler', () => {
  let instrumentation: AwsLambdaInstrumentation;

  let oldEnv: NodeJS.ProcessEnv;

  const ctx = {
    functionName: 'my_function',
    invokedFunctionArn: 'my_arn',
    awsRequestId: 'aws_request_id',
  } as Context;

  const initializeHandler = (
    handler: string,
    config: AwsLambdaInstrumentationConfig = {
      detectTrigger: true,
    }
  ) => {
    process.env._HANDLER = handler;

    instrumentation = new AwsLambdaInstrumentation(config);
    instrumentation.setTracerProvider(provider);
  };

  const lambdaRequire = (module: string) =>
    require(path.resolve(__dirname, '..', module));

  beforeEach(() => {
    oldEnv = { ...process.env };
    process.env.LAMBDA_TASK_ROOT = path.resolve(__dirname, '..');
  });

  afterEach(() => {
    process.env = oldEnv;
    instrumentation.disable();

    memoryExporter.reset();
  });

  describe('sqs span tests', () => {
    it('should export two valid span', async () => {
      initializeHandler('lambda-test/sqs.handler');

      const event: SQSEvent = {
        Records: [sqsRecord1],
      };

      await lambdaRequire('lambda-test/sqs').handler(event, ctx);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      const [spanLambda, sqsSpan] = spans;
      assertSpanSuccess(spanLambda);
      assertSQSEventSpanSuccess(sqsSpan, sqsRecord1.eventSourceARN);
      assert.strictEqual(sqsSpan.parentSpanId, undefined);
      assert.strictEqual(spanLambda.parentSpanId, sqsSpan.spanContext().spanId);
    });

    it('sqs span should reject when throwing error', async () => {
      initializeHandler('lambda-test/sqs.errorAsync');

      const event: SQSEvent = {
        Records: [sqsRecord1],
      };

      try {
        await lambdaRequire('lambda-test/sqs').errorAsync(event, ctx);
      } catch (e) {}

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      const [_, sqsSpan] = spans;
      assertSQSEventSpanFailure(sqsSpan, sqsRecord1.eventSourceARN);
    });

    it('sqs span source should be the source if source of all records is the same', async () => {
      initializeHandler('lambda-test/sqs.handler');

      const event: SQSEvent = {
        Records: [sqsRecord1, sqsRecord2],
      };

      await lambdaRequire('lambda-test/sqs').handler(event, ctx);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      const [_, sqsSpan] = spans;
      assert.strictEqual(sqsRecord1.eventSourceARN, sqsRecord2.eventSourceARN);
      assertSQSEventSpanSuccess(sqsSpan, sqsRecord1.eventSourceARN);
    });

    it('sqs span source should be the "multiple_sources" if source records contain different sources', async () => {
      initializeHandler('lambda-test/sqs.handler');

      const event: SQSEvent = {
        Records: [sqsRecord1, fifoMessage],
      };

      await lambdaRequire('lambda-test/sqs').handler(event, ctx);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      const [_, sqsSpan] = spans;
      assert.notStrictEqual(
        sqsRecord1.eventSourceARN,
        fifoMessage.eventSourceARN
      );
      assertSQSEventSpanSuccess(sqsSpan, 'multiple_sources');
    });

    it('sqs span links should be extracted from AWSTraceHeader attribute using xray propagator', async () => {
      initializeHandler('lambda-test/sqs.handler');

      const event: SQSEvent = {
        Records: [sqsRecordWithLink],
      };

      await lambdaRequire('lambda-test/sqs').handler(event, ctx);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      const [_, sqsSpan] = spans;
      assertSQSEventSpanSuccess(sqsSpan, sqsRecordWithLink.eventSourceARN);
      assert.strictEqual(sqsSpan.links.length, 1);
      const {
        links: [link],
      } = sqsSpan;

      assert.deepStrictEqual(link.context, linkContext);
    });
  });
});
