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

import * as assert from 'assert';

import { FsInstrumentation } from '@opentelemetry/instrumentation-fs';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { DetectorSync } from '@opentelemetry/resources';

describe('[Integration] Internal tracing', () => {
  it('should not start spans for any network or fs operation in any detector', async () => {
    // For ECS detector we setup a mock URL to fetch metadata
    process.env.ECS_CONTAINER_METADATA_URI_V4 =
      'http://169.254.169.254/metadata';

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
      awsBeanstalkDetectorSync,
      awsEc2DetectorSync,
      awsEcsDetectorSync,
      awsEksDetectorSync,
      awsLambdaDetectorSync,
    } = require('../../build/src');

    // NOTE: the require process makes use of the fs API so spans are being exported.
    // We reset the exporter to have a clean state for assertions
    await spanProcessor.forceFlush();
    memoryExporter.reset();

    const detectors = [
      awsBeanstalkDetectorSync,
      awsEc2DetectorSync,
      awsEcsDetectorSync,
      awsEksDetectorSync,
      awsLambdaDetectorSync,
    ] as DetectorSync[];

    for (const d of detectors) {
      const r = d.detect();
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
  }).timeout(10000);
});
