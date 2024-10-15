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

export {
  assertCloudResource,
  assertContainerResource,
  assertHostResource,
  assertK8sResource,
  assertTelemetrySDKResource,
  assertServiceResource,
  assertProcessResource,
  assertEmptyResource,
} from './resource-assertions';
export {
  createTestNodeSdk,
  OtlpSpanKind,
  TestSpan,
  TestCollector,
  RunTestFixtureOptions,
  runTestFixture,
} from './test-fixtures';
export {
  startDocker,
  cleanUpDocker,
  assertSpan,
  assertPropagation,
  TimedEvent,
  getPackageVersion,
  TestMetricReader,
  initMeterProvider,
} from './test-utils';
export {
  mochaHooks,
  getInstrumentation,
  registerInstrumentationTesting,
  getTestMemoryExporter,
  setTestMemoryExporter,
  getTestSpans,
  resetMemoryExporter,
  registerInstrumentationTestingProvider,
} from './instrumentations';
