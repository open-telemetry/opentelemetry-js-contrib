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
