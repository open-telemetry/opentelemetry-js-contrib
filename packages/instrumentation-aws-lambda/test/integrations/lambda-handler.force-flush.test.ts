/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// We access through node_modules to allow it to be patched.

import * as path from 'path';

import { AwsLambdaInstrumentation } from '../../src';
import {
  BatchSpanProcessor,
  InMemorySpanExporter,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { Context } from 'aws-lambda';
import * as assert from 'assert';
import {
  ProxyTracerProvider,
  TracerProvider as ApiTracerProvider,
} from '@opentelemetry/api';
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
    provider: ApiTracerProvider
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

  it('should force flush TracerProvider', async () => {
    const provider = new TracerProvider({
      spanProcessors: [
        new BatchSpanProcessor({ exporter: traceMemoryExporter }),
      ],
    });
    let forceFlushed = false;
    const forceFlush = () =>
      new Promise<void>(resolve => {
        forceFlushed = true;
        resolve();
      });
    provider.forceFlush = forceFlush;
    initializeHandlerTracing('lambda-test/sync.handler', provider);

    await lambdaRequire('lambda-test/sync').handler('arg', ctx);

    assert.strictEqual(forceFlushed, true);
  });

  it('should force flush ProxyTracerProvider with TracerProvider', async () => {
    const tracerProvider = new TracerProvider({
      spanProcessors: [
        new BatchSpanProcessor({ exporter: traceMemoryExporter }),
      ],
    });
    const provider = new ProxyTracerProvider();
    provider.setDelegate(tracerProvider);
    let forceFlushed = false;
    const forceFlush = () =>
      new Promise<void>(resolve => {
        forceFlushed = true;
        resolve();
      });
    tracerProvider.forceFlush = forceFlush;
    initializeHandlerTracing('lambda-test/sync.handler', provider);

    await lambdaRequire('lambda-test/sync').handler('arg', ctx);

    assert.strictEqual(forceFlushed, true);
  });

  it('should force flush MeterProvider', async () => {
    const provider = new MeterProvider({
      readers: [
        new PeriodicExportingMetricReader({ exporter: metricMemoryExporter }),
      ],
    });
    let forceFlushed = false;
    const forceFlush = () =>
      new Promise<void>(resolve => {
        forceFlushed = true;
        resolve();
      });
    provider.forceFlush = forceFlush;
    initializeHandlerMetrics('lambda-test/sync.handler', provider);

    await lambdaRequire('lambda-test/sync').handler('arg', ctx);

    assert.strictEqual(forceFlushed, true);
  });

  it('should complete handler after force flush providers', async () => {
    const nodeTracerProvider = new TracerProvider({
      spanProcessors: [
        new BatchSpanProcessor({ exporter: traceMemoryExporter }),
      ],
    });
    const tracerProvider = new ProxyTracerProvider();
    tracerProvider.setDelegate(nodeTracerProvider);
    let tracerForceFlushed = false;
    const tracerForceFlush = () =>
      new Promise<void>(resolve => {
        tracerForceFlushed = true;
        resolve();
      });
    nodeTracerProvider.forceFlush = tracerForceFlush;

    const meterProvider = new MeterProvider({
      readers: [
        new PeriodicExportingMetricReader({ exporter: metricMemoryExporter }),
      ],
    });
    let meterForceFlushed = false;
    const meterForceFlush = () =>
      new Promise<void>(resolve => {
        meterForceFlushed = true;
        resolve();
      });
    meterProvider.forceFlush = meterForceFlush;

    process.env._HANDLER = 'lambda-test/sync.handler';

    instrumentation = new AwsLambdaInstrumentation();
    instrumentation.setTracerProvider(tracerProvider);
    instrumentation.setMeterProvider(meterProvider);

    await lambdaRequire('lambda-test/sync').handler('arg', ctx);

    assert.strictEqual(tracerForceFlushed, true);
    assert.strictEqual(meterForceFlushed, true);
  });
});
