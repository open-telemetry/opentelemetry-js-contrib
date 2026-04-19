/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';

import { FsInstrumentation } from '@opentelemetry/instrumentation-fs';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ResourceDetector, detectResources } from '@opentelemetry/resources';

describe('[Integration] Internal tracing', () => {
  it('should not start spans for any network or fs operation in any detector', async () => {
    // For ECS detector we setup a mock URL to fetch metadata
    process.env.ECS_CONTAINER_METADATA_URI_V4 =
      'http://169.254.169.254/metadata';
    process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs24.x';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'name';
    process.env.AWS_LAMBDA_FUNCTION_VERSION = '1';
    process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = '128';
    process.env.AWS_LAMBDA_METADATA_API = '169.254.100.1:9001';
    process.env.AWS_LAMBDA_METADATA_TOKEN = 'test-token';

    const memoryExporter = new InMemorySpanExporter();
    const spanProcessor = new SimpleSpanProcessor(memoryExporter);
    const sdk = new NodeSDK({
      instrumentations: [new FsInstrumentation(), new HttpInstrumentation()],
      spanProcessors: [spanProcessor],
    });
    sdk.start();

    // NOTE: detectors implementing the `DetectorSync` interface and starting
    // HTTP requests within the `detect` method will produce Noop Spans since
    // the SDK resolves the trace provider after resource detectors are triggered.
    // Ref: https://github.com/open-telemetry/opentelemetry-js/blob/38f6689480d28dcbdafcb7b5ba4b14025328ffda/experimental/packages/opentelemetry-sdk-node/src/sdk.ts#L210-L240
    //
    // So having the detector in the config would result in no spans for Azure requests
    // being exported which is what we want. Although we may think we're safe of sending
    // internal tracing any change that delays these request will result in internal
    // tracing being exported. We do the detection outside the SDK constructor to have such
    // scenario.
    const {
      awsBeanstalkDetector,
      awsEc2Detector,
      awsEcsDetector,
      awsEksDetector,
      awsLambdaDetector,
    } = require('../../build/src');

    // NOTE: the require process makes use of the fs API so spans are being exported.
    // We reset the exporter to have a clean state for assertions
    await spanProcessor.forceFlush();
    memoryExporter.reset();

    const detectors = [
      awsBeanstalkDetector,
      awsEc2Detector,
      awsEcsDetector,
      awsEksDetector,
      awsLambdaDetector,
    ] as ResourceDetector[];

    for (const d of detectors) {
      const r = detectResources({ detectors: [d] });
      await r.waitForAsyncAttributes?.();
    }

    // Wait for the next loop to let the span close properly
    await new Promise(r => setTimeout(r, 0));
    const spans = memoryExporter.getFinishedSpans();

    assert.equal(
      spans.length,
      0,
      'no spans exported from any AWS resource detector'
    );

    await sdk.shutdown();
    delete process.env.ECS_CONTAINER_METADATA_URI_V4;
    delete process.env.AWS_EXECUTION_ENV;
    delete process.env.AWS_REGION;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.AWS_LAMBDA_FUNCTION_VERSION;
    delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
    delete process.env.AWS_LAMBDA_METADATA_API;
    delete process.env.AWS_LAMBDA_METADATA_TOKEN;
  }).timeout(10000);
});
