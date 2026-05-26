/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 */

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
import { Context, KinesisStreamEvent } from 'aws-lambda';
import * as assert from 'assert';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { assertSpanSuccess } from './lambda-handler.test';
import { LambdaAttributes, TriggerOrigin } from '../../src/triggers';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new BatchSpanProcessor(memoryExporter)],
});
provider.register();

const kinesisEvent: KinesisStreamEvent = {
  Records: [
    {
      kinesis: {
        kinesisSchemaVersion: '1.0',
        partitionKey: '1',
        sequenceNumber: '49590338271490256608559692538361571095921575989136588898',
        data: 'VGVzdCBtZXNzYWdl',
        approximateArrivalTimestamp: 1545084650.987,
      },
      eventSource: 'aws:kinesis',
      eventVersion: '1.0',
      eventID: 'shardId-000000000006:49590338271490256608559692538361571095921575989136588898',
      eventName: 'aws:kinesis:record',
      invokeIdentityArn: 'arn:aws:iam::123456789012:role/lambda-role',
      awsRegion: 'eu-west-1',
      eventSourceARN: 'arn:aws:kinesis:eu-west-1:123456789012:stream/test-stream',
    },
  ],
};

const assertKinesisEventSpan = (span: ReadableSpan, sourceName?: string) => {
  assert.strictEqual(span.kind, SpanKind.CONSUMER);
  assert.strictEqual(
    span.attributes[LambdaAttributes.TRIGGER_SERVICE],
    TriggerOrigin.KINESIS
  );
  assert.strictEqual(
    span.attributes[SemanticAttributes.MESSAGING_OPERATION],
    'process'
  );
  assert.strictEqual(
    span.attributes[SemanticAttributes.MESSAGING_SYSTEM],
    'aws.kinesis'
  );
  assert.strictEqual(span.attributes['messaging.source.kind'], 'stream');
  if (sourceName) {
    assert.strictEqual(span.name, `${sourceName} process`);
    assert.strictEqual(span.attributes['messaging.source.name'], sourceName);
  }
};

describe('Kinesis handler', () => {
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

  it('exports a trigger span for kinesis events', async () => {
    initializeHandler('lambda-test/sqs.handler');

    await lambdaRequire('lambda-test/sqs').handler(kinesisEvent, ctx);

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);
    const [spanLambda, kinesisSpan] = spans;
    assertSpanSuccess(spanLambda);
    assertKinesisEventSpan(kinesisSpan, kinesisEvent.Records[0].eventSourceARN);
    assert.strictEqual(kinesisSpan.status.code, SpanStatusCode.UNSET);
    assert.strictEqual(kinesisSpan.parentSpanContext?.spanId, undefined);
    assert.strictEqual(
      spanLambda.parentSpanContext?.spanId,
      kinesisSpan.spanContext().spanId
    );
  });
});
