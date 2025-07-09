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

import {
  HrTime,
  Span,
  Attributes,
  SpanKind,
  SpanStatus,
} from '@opentelemetry/api';
import * as assert from 'assert';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { MetricReader, MeterProvider } from '@opentelemetry/sdk-metrics';
import {
  hrTimeToMilliseconds,
  hrTimeToMicroseconds,
} from '@opentelemetry/core';
import * as path from 'path';
import * as fs from 'fs';
import { InstrumentationBase } from '@opentelemetry/instrumentation';

export const assertSpan = (
  span: ReadableSpan,
  kind: SpanKind,
  attributes: Attributes,
  events: TimedEvent[],
  status: SpanStatus
) => {
  assert.strictEqual(span.spanContext().traceId.length, 32);
  assert.strictEqual(span.spanContext().spanId.length, 16);
  assert.strictEqual(span.kind, kind);

  assert.ok(span.endTime);
  assert.strictEqual(span.links.length, 0);

  assert.ok(
    hrTimeToMicroseconds(span.startTime) < hrTimeToMicroseconds(span.endTime)
  );
  assert.ok(hrTimeToMilliseconds(span.endTime) > 0);

  // attributes
  assert.deepStrictEqual(span.attributes, attributes);

  // events
  assert.deepStrictEqual(span.events, events);

  assert.strictEqual(span.status.code, status.code);
  if (status.message) {
    assert.strictEqual(span.status.message, status.message);
  }
};

// Check if childSpan was propagated from parentSpan
export const assertPropagation = (
  childSpan: ReadableSpan,
  parentSpan: Span
) => {
  const targetSpanContext = childSpan.spanContext();
  const sourceSpanContext = parentSpan.spanContext();
  assert.strictEqual(targetSpanContext.traceId, sourceSpanContext.traceId);
  assert.strictEqual(
    childSpan.parentSpanContext?.spanId,
    sourceSpanContext.spanId
  );
  assert.strictEqual(
    targetSpanContext.traceFlags,
    sourceSpanContext.traceFlags
  );
  assert.notStrictEqual(targetSpanContext.spanId, sourceSpanContext.spanId);
};

/**
 * Represents a timed event.
 * A timed event is an event with a timestamp.
 */
export interface TimedEvent {
  time: HrTime;
  /** The name of the event. */
  name: string;
  /** The attributes of the event. */
  attributes?: Attributes;
  /** Count of attributes of the event that were dropped due to collection limits */
  droppedAttributesCount?: number;
}

export const getPackageVersion = (packageName: string) => {
  // With npm workspaces, `require.main` could be in the top-level node_modules,
  // e.g. "<repo>/node_modules/mocha/bin/mocha" when running mocha tests, while
  // the target package could be installed in a workspace subdir, e.g.
  // "<repo>/packages/instrumentation/mysql2" for
  // "test-all-versions" tests that tend to install conflicting package
  // versions. Prefix the search paths with the cwd to include the workspace
  // dir.
  const mainPath = require?.resolve(packageName, {
    paths: [path.join(process.cwd(), 'node_modules')].concat(
      require?.main?.paths || []
    ),
  });

  // Some packages are resolved to a subfolder because their "main" points to it.
  // As a consequence the "package.json" path is wrong and we get a MODULE_NOT_FOUND
  // error. We should resolve the package folder from the closest `node_modules` ancestor.
  // `tedious` package is an example
  // {
  //   "name: "tedious",
  //   "main: "lib/tedious.js",
  //   ...
  // }
  // resolving `packagePath` to `/path/to/opentelemetry-js-contrib/node_modules/tedious/lib/tedious.js`
  const idx = mainPath.lastIndexOf('node_modules');
  const pjPath = path.join(
    mainPath.slice(0, idx),
    'node_modules',
    packageName,
    'package.json'
  );
  return JSON.parse(fs.readFileSync(pjPath, 'utf8')).version;
};

export class TestMetricReader extends MetricReader {
  constructor() {
    super();
  }

  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

export const initMeterProvider = (
  instrumentation: InstrumentationBase
): TestMetricReader => {
  const metricReader = new TestMetricReader();
  const meterProvider = new MeterProvider({
    readers: [metricReader],
  });
  instrumentation.setMeterProvider(meterProvider);

  return metricReader;
};
