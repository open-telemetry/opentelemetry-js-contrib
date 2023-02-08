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

import { AwsLambdaInstrumentation } from '../../src';
import {
  BatchSpanProcessor,
  InMemorySpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Context } from 'aws-lambda';
import * as assert from 'assert';
import { ProxyTracerProvider, TracerProvider } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';

const traceMemoryExporter = new InMemorySpanExporter();
const metricMemoryExporter = new InMemoryMetricExporter(
  AggregationTemporality.CUMULATIVE
);

describe('force flush', () => {
  let instrumentation: AwsLambdaInstrumentation;

  let oldEnv: NodeJS.ProcessEnv;

  const ctx = {
    functionName: 'my_function',
    invokedFunctionArn: 'my_arn',
    awsRequestId: 'aws_request_id',
  } as Context;

  const initializeHandlerTracing = (
    handler: string,
    provider: TracerProvider
  ) => {
    process.env._HANDLER = handler;

    instrumentation = new AwsLambdaInstrumentation();
    instrumentation.setTracerProvider(provider);
  };

  const initializeHandlerMetrics = (
    handler: string,
    provider: MeterProvider
  ) => {
    process.env._HANDLER = handler;

    instrumentation = new AwsLambdaInstrumentation();
    instrumentation.setMeterProvider(provider);
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

    traceMemoryExporter.reset();
    metricMemoryExporter.reset();
  });

  it('should force flush NodeTracerProvider', async () => {
    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new BatchSpanProcessor(traceMemoryExporter));
    provider.register();
    let forceFlushed = false;
    const forceFlush = () =>
      new Promise<void>(resolve => {
        forceFlushed = true;
        resolve();
      });
    provider.forceFlush = forceFlush;
    initializeHandlerTracing('lambda-test/sync.handler', provider);

    await new Promise((resolve, reject) => {
      lambdaRequire('lambda-test/sync').handler(
        'arg',
        ctx,
        (err: Error, res: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        }
      );
    });

    assert.strictEqual(forceFlushed, true);
  });

  it('should force flush ProxyTracerProvider with NodeTracerProvider', async () => {
    const nodeTracerProvider = new NodeTracerProvider();
    nodeTracerProvider.addSpanProcessor(
      new BatchSpanProcessor(traceMemoryExporter)
    );
    nodeTracerProvider.register();
    const provider = new ProxyTracerProvider();
    provider.setDelegate(nodeTracerProvider);
    let forceFlushed = false;
    const forceFlush = () =>
      new Promise<void>(resolve => {
        forceFlushed = true;
        resolve();
      });
    nodeTracerProvider.forceFlush = forceFlush;
    initializeHandlerTracing('lambda-test/sync.handler', provider);

    await new Promise((resolve, reject) => {
      lambdaRequire('lambda-test/sync').handler(
        'arg',
        ctx,
        (err: Error, res: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        }
      );
    });

    assert.strictEqual(forceFlushed, true);
  });

  it('should force flush MeterProvider', async () => {
    const provider = new MeterProvider();
    provider.addMetricReader(
      new PeriodicExportingMetricReader({ exporter: metricMemoryExporter })
    );
    let forceFlushed = false;
    const forceFlush = () =>
      new Promise<void>(resolve => {
        forceFlushed = true;
        resolve();
      });
    provider.forceFlush = forceFlush;
    initializeHandlerMetrics('lambda-test/sync.handler', provider);

    await new Promise((resolve, reject) => {
      lambdaRequire('lambda-test/sync').handler(
        'arg',
        ctx,
        (err: Error, res: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        }
      );
    });

    assert.strictEqual(forceFlushed, true);
  });
});
