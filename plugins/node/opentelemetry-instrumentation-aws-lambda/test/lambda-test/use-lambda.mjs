import * as path from 'path';
import { fileURLToPath } from 'url';

import { trace } from '@opentelemetry/api';
import { createTestNodeSdk } from '@opentelemetry/contrib-test-utils';

import { AwsLambdaInstrumentation } from '../../build/src/index.js';
import { load } from '../vendor/UserFunction.js';

process.env.LAMBDA_TASK_ROOT = path.dirname(fileURLToPath(import.meta.url));
process.env._HANDLER = 'module.handler';

const instrumentation = new AwsLambdaInstrumentation();
const sdk = createTestNodeSdk({
  serviceName: 'use-lambda',
  instrumentations: [instrumentation],
});
sdk.start();
instrumentation.setTracerProvider(trace.getTracerProvider());

const handler = await load(process.env.LAMBDA_TASK_ROOT, process.env._HANDLER);
await handler('arg', {
  functionName: 'my_function',
  invokedFunctionArn: 'my_arn',
  awsRequestId: 'aws_request_id',
});
