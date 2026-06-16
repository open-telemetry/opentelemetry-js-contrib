/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { detectResources } from '@opentelemetry/resources';

const sdk = new NodeSDK({
  instrumentations: [new HttpInstrumentation()],
});
sdk.start();

// Defer import until after instrumentation is added
const { gcpDetector } = await import(
  '../../../build/src/detectors/GcpDetector.js'
);
const resource = detectResources({ detectors: [gcpDetector] });
await resource.waitForAsyncAttributes?.();

console.log(resource);

await sdk.shutdown();
