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
import { Context, SNSEvent } from 'aws-lambda';
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

const snsEvent: SNSEvent = {
  Records: [
    {
      EventSource: 'aws:sns',
      EventVersion: '1.0',
      EventSubscriptionArn:
        'arn:aws:sns:eu-west-1:123456789012:test-topic:subscription',
      Sns: {
        Type: 'Notification',
        MessageId: '95df01b4-ee98-5cb9-9903-4c221d41eb5e',
        TopicArn: 'arn:aws:sns:eu-west-1:123456789012:test-topic',
        Subject: 'TestInvoke',
        Message: 'Hello from SNS!',
        Timestamp: '2019-01-02T12:45:07.000Z',
        SignatureVersion: '1',
        Signature: 'EXAMPLE',
        SigningCertUrl:
          'https://sns.eu-west-1.amazonaws.com/SimpleNotificationService.pem',
        UnsubscribeUrl:
          'https://sns.eu-west-1.amazonaws.com/?Action=Unsubscribe',
        MessageAttributes: {},
      },
    },
  ],
};

const assertSNSEventSpan = (span: ReadableSpan, sourceName?: string) => {
  assert.strictEqual(span.kind, SpanKind.CONSUMER);
  assert.strictEqual(
    span.attributes[LambdaAttributes.TRIGGER_SERVICE],
    TriggerOrigin.SNS
  );
  assert.strictEqual(
    span.attributes[SemanticAttributes.MESSAGING_OPERATION],
    'process'
  );
  assert.strictEqual(
    span.attributes[SemanticAttributes.MESSAGING_SYSTEM],
    'aws.sns'
  );
  assert.strictEqual(span.attributes['messaging.source.kind'], 'topic');
  if (sourceName) {
    assert.strictEqual(span.name, `${sourceName} process`);
    assert.strictEqual(
      span.attributes[SemanticAttributes.MESSAGING_DESTINATION],
      'test-topic'
    );
    assert.strictEqual(span.attributes['messaging.destination.name'], sourceName);
  }
};

describe('SNS handler', () => {
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

  it('exports a trigger span for sns events', async () => {
    initializeHandler('lambda-test/sqs.handler');

    await lambdaRequire('lambda-test/sqs').handler(snsEvent, ctx);

    const spans = memoryExporter.getFinishedSpans();
    assert.strictEqual(spans.length, 2);
    const [spanLambda, snsSpan] = spans;
    assertSpanSuccess(spanLambda);
    assertSNSEventSpan(snsSpan, snsEvent.Records[0].Sns.TopicArn);
    assert.strictEqual(snsSpan.status.code, SpanStatusCode.UNSET);
    assert.strictEqual(snsSpan.parentSpanContext?.spanId, undefined);
    assert.strictEqual(
      spanLambda.parentSpanContext?.spanId,
      snsSpan.spanContext().spanId
    );
  });
});
