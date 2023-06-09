import { BatchSpanProcessor, InMemorySpanExporter, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import assert from 'node:assert';
import test from 'node:test';
import {
  AwsLambdaInstrumentation,
} from '../../build/src/index.js';
import path from 'node:path';
import * as url from 'url';

test('synchronous passing test', async (t) => {
  const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
  process.env.LAMBDA_TASK_ROOT = path.resolve(__dirname, '..');
  const memoryExporter = new InMemorySpanExporter();

  let instrumentation
  const initializeHandler = (
    handler,
    config = {}
  ) => {
    process.env._HANDLER = handler;

    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new BatchSpanProcessor(memoryExporter));
    provider.register();

    instrumentation = new AwsLambdaInstrumentation(config);
    instrumentation.setTracerProvider(provider);

    return provider;
  };
  const ctx = {
    functionName: 'my_function',
    invokedFunctionArn: 'my_arn',
    awsRequestId: 'aws_request_id',
  }


  initializeHandler('lambda-test/es-module.handler');
  const result = await (await import('../lambda-test/es-module.mjs')).handler(
    'arg',
    ctx
  );
  assert.strictEqual(result, 'ok');
  const spans = memoryExporter.getFinishedSpans();
  const [span] = spans;
  assert.strictEqual(spans.length, 1);
  // assertSpanSuccess(span);
  assert.strictEqual(span.parentSpanId, undefined);
});
