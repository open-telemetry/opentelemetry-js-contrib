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

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { IResource } from '@opentelemetry/resources';

describe('[Integration] AlibabaCloudEcsDetector', () => {
  it('should not start spans for detector requests', async () => {
    const memoryExporter = new InMemorySpanExporter();
    const sdk = new NodeSDK({
      instrumentations: [new HttpInstrumentation()],
      spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
    });

    sdk.start();

    // NOTE: detectors implementing the `DetectorSync` interface and starting
    // HTTP requests within the `detect` method will produce Noop Spans since
    // the SDK resolves the trace provider after resource detectors are triggered.
    // Ref: https://github.com/open-telemetry/opentelemetry-js/blob/38f6689480d28dcbdafcb7b5ba4b14025328ffda/experimental/packages/opentelemetry-sdk-node/src/sdk.ts#L210-L240
    //
    // So having the detector in the config would result in no spans for Alibaba requests
    // being exported which is what we want. Although we may think we're safe of sending
    // internal tracing any change that delays these request will result in internal
    // tracing being exported. We do the detection outside the SDK constructor to have such
    // scenario.
    const {
      alibabaCloudEcsDetector,
    } = require('../../build/src/detectors/AlibabaCloudEcsDetector');
    const resource = alibabaCloudEcsDetector.detect() as IResource;
    await resource.waitForAsyncAttributes?.();

    // Wait for the next loop to let the span close properly
    await new Promise(r => setTimeout(r, 0));
    const spans = memoryExporter.getFinishedSpans();

    assert.equal(spans.length, 0, 'no spans exported for GcpDetector');

    await sdk.shutdown();
  });
});
