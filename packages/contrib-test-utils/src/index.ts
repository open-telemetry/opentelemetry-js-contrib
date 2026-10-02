/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  assertCloudResource,
  assertContainerResource,
  assertEmptyResource,
  assertHostResource,
  assertK8sResource,
  assertProcessResource,
  assertServiceResource,
  assertTelemetrySDKResource,
} from './resource-assertions';
export { OtlpSpanKind } from './otlp-types';
export {
  createTestNodeSdk,
  runTestFixture,
  TestCollector,
} from './test-fixtures';
export type { TestSpan, RunTestFixtureOptions } from './test-fixtures';
export {
  assertPropagation,
  assertSpan,
  getPackageVersion,
  initMeterProvider,
  TestMetricReader,
} from './test-utils';
export type { TimedEvent } from './test-utils';
export {
  getInstrumentation,
  getTestMemoryExporter,
  getTestSpans,
  mochaHooks,
  registerInstrumentationTesting,
  registerInstrumentationTestingProvider,
  resetMemoryExporter,
  setTestMemoryExporter,
} from './instrumentations';
