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
import { Context, S3Event } from 'aws-lambda';
import * as assert from 'assert';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { assertSpanSuccess } from './lambda-handler.test';
import { LambdaAttributes, TriggerOrigin } from '../../src/triggers';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new BatchSpanProcessor(memoryExporter));
provider.register();

/*
  example from https://docs.aws.amazon.com/lambda/latest/dg/with-s3.html
 */
const s3Event: S3Event = {
  Records: [
    {
      eventVersion: '2.1',
      eventSource: 'aws:s3',
      awsRegion: 'us-east-2',
      eventTime: '2019-09-03T19:37:27.192Z',
      eventName: 'ObjectCreated:Put',
      userIdentity: {
        principalId: 'AWS:AIDAINPONIXQXHT3IKHL2',
      },
      requestParameters: {
        sourceIPAddress: '205.255.255.255',
      },
      responseElements: {
        'x-amz-request-id': 'D82B88E5F771F645',
        'x-amz-id-2':
          'vlR7PnpV2Ce81l0PRw6jlUpck7Jo5ZsQjryTjKlc5aLWGVHPZLj5NeC6qMa0emYBDXOo6QBU0Wo=',
      },
      s3: {
        s3SchemaVersion: '1.0',
        configurationId: '828aa6fc-f7b5-4305-8584-487c791949c1',
        bucket: {
          name: 'DOC-EXAMPLE-BUCKET',
          ownerIdentity: {
            principalId: 'A3I5XTEXAMAI3E',
          },
          arn: 'arn:aws:s3:::lambda-artifacts-deafc19498e3f2df',
        },
        object: {
          key: 'b21b84d653bb07b05b1e6b33684dc11b',
          size: 1305107,
          eTag: 'b21b84d653bb07b05b1e6b33684dc11b',
          sequencer: '0C0F6F405D6ED209E1',
        },
      },
    },
  ],
};

const assertS3EventSpan = (span: ReadableSpan, s3Event: S3Event) => {
  assert.strictEqual(span.kind, SpanKind.SERVER);

  assert.strictEqual(
    span.attributes[LambdaAttributes.TRIGGER_SERVICE],
    TriggerOrigin.S3
  );

  assert.strictEqual(
    span.attributes['aws.s3.event.trigger'],
    s3Event.Records[0].eventName
  );
  assert.strictEqual(
    span.attributes['aws.s3.bucket.name'],
    s3Event.Records[0].s3.bucket.name
  );
  assert.strictEqual(
    span.attributes['aws.s3.object.key'],
    s3Event.Records[0].s3.object.key
  );

  assert.strictEqual(span.name, s3Event.Records[0].eventName);
};

const assertS3EventSpanSuccess = (span: ReadableSpan, s3Event: S3Event) => {
  assertS3EventSpan(span, s3Event);
  assert.strictEqual(span.status.code, SpanStatusCode.UNSET);
  assert.strictEqual(span.status.message, undefined);
};

describe('S3 handler', () => {
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

  describe('s3 span tests', () => {
    it('should export two valid span', async () => {
      initializeHandler('lambda-test/sqs.handler');

      await lambdaRequire('lambda-test/sqs').handler(s3Event, ctx);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      const [spanLambda, sqsSpan] = spans;
      assertSpanSuccess(spanLambda);
      assertS3EventSpanSuccess(sqsSpan, s3Event);
      assert.strictEqual(sqsSpan.parentSpanId, undefined);
      assert.strictEqual(spanLambda.parentSpanId, sqsSpan.spanContext().spanId);
    });

    it('should export two valid span', async () => {
      initializeHandler('lambda-test/sqs.handler');

      await lambdaRequire('lambda-test/sqs').handler(s3Event, ctx);

      const spans = memoryExporter.getFinishedSpans();
      assert.strictEqual(spans.length, 2);
      const [spanLambda, sqsSpan] = spans;
      assertSpanSuccess(spanLambda);
      assertS3EventSpanSuccess(sqsSpan, s3Event);
      assert.strictEqual(sqsSpan.parentSpanId, undefined);
      assert.strictEqual(spanLambda.parentSpanId, sqsSpan.spanContext().spanId);
    });
  });
});
