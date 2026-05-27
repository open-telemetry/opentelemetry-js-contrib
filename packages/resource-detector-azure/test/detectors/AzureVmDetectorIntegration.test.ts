/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { TestMetricReader } from '@opentelemetry/contrib-test-utils';

describe('[Integration] AzureVmServiceDetector', () => {
  it('should not start spans for detector requests', async () => {
    const memoryExporter = new InMemorySpanExporter();
    const sdk = new NodeSDK({
      instrumentations: [new HttpInstrumentation()],
      spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
      metricReaders: [new TestMetricReader()],
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
      azureVmDetector,
    } = require('../../build/src/detectors/AzureVmDetector');
    const resource = azureVmDetector.detect();
    await resource.waitForAsyncAttributes?.();

    // Wait for the next loop to let the span close properly
    await new Promise(r => setTimeout(r, 0));
    const spans = memoryExporter.getFinishedSpans();

    assert.equal(spans.length, 0, 'no spans exported for AzureVmDetector');

    await sdk.shutdown();
  });
});
