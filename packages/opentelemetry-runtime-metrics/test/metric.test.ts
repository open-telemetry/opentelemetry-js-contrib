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

const mock = require('mock-require');
const v8 = require('v8');
import { ExportResult } from '@opentelemetry/core';
import {
  Histogram,
  MeterProvider,
  MetricExporter,
  MetricRecord,
} from '@opentelemetry/metrics';
import * as assert from 'assert';
import * as os from 'os';
import * as sinon from 'sinon';

const nativeJson = require('./mocks/native.json');
const memoryJson = require('./mocks/memory.json');
const heapJson = require('./mocks/heap.json');

class NoopExporter implements MetricExporter {
  export(
    metrics: MetricRecord[],
    resultCallback: (result: ExportResult) => void
  ): void {
    // console.log('>>>>>>>>>>>>> EXPORTING', metrics.length);
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const originalSetTimeout = setTimeout;

const GC_VALUES = ['min', 'max', 'avg', 'median', 'p95'];
const HEAP_SPACE_VALUES = ['size', 'usedSize', 'availableSize', 'physicalSize'];
const mockedNative = {
  start: function () {},
  stats: function () {
    return nativeJson;
  },
};

const mockedOS = {
  freemem: function () {
    return 7179869184;
  },
  totalmem: function () {
    return 17179869184;
  },
};
const mockedUptime = 1405;

const INTERVAL = 3000;

let metrics: any;

describe('Runtime Metrics', () => {
  let sandbox: sinon.SinonSandbox;
  let runtimeMetrics: any;
  let exporter: MetricExporter;
  let exportSpy: any;

  beforeEach(done => {
    sandbox = sinon.createSandbox();
    sandbox.useFakeTimers();

    mock('node-gyp-build', () => {
      return mockedNative;
    });

    sandbox.stub(os, 'freemem').returns(mockedOS.freemem());
    sandbox.stub(os, 'totalmem').returns(mockedOS.totalmem());
    sandbox.stub(v8, 'getHeapStatistics').returns(heapJson);
    sandbox.stub(process, 'memoryUsage').returns(memoryJson);
    sandbox.stub(process, 'uptime').returns(mockedUptime);

    exporter = new NoopExporter();
    exportSpy = sandbox.stub(exporter, 'export');

    const meterProvider = new MeterProvider({
      interval: INTERVAL,
      exporter,
    });

    // it seems like this is the only way to be able to mock
    // `node-gyp-build` before metrics are being loaded, if import them before
    // the first pass on unit tests will not mock correctly
    metrics = require('../src');
    runtimeMetrics = new metrics.RuntimeMetrics({
      meterProvider,
      name: 'opentelemetry-runtime-metrics',
    });
    runtimeMetrics.start();

    // sinon fake doesn't work fine with setImmediate
    originalSetTimeout(() => {
      // move the clock with the same value as interval
      sandbox.clock.tick(INTERVAL);
      // move to "real" next tick so that async batcher observer will start
      // processing metrics
      originalSetTimeout(() => {
        // allow all calbacks to finish correctly as they are finishing in
        // next tick due to async
        sandbox.clock.tick(1);
        originalSetTimeout(() => {
          done();
        });
      });
    });
  });
  afterEach(() => {
    sandbox.restore();
  });

  it('should create a new instance', () => {
    assert.ok(runtimeMetrics instanceof metrics.RuntimeMetrics);
  });

  it('should export Memory runtime metrics', () => {
    const recordsRuntime = getRecords(exportSpy.args[0][0], 'runtime.node.mem');
    assert.strictEqual(recordsRuntime.length, 5);
    ensureValue(
      recordsRuntime[0],
      'runtime.node.mem.external',
      memoryJson.external
    );
    ensureValue(recordsRuntime[1], 'runtime.node.mem.free', mockedOS.freemem());
    ensureValue(
      recordsRuntime[2],
      'runtime.node.mem.heapTotal',
      memoryJson.heapTotal
    );
    ensureValue(
      recordsRuntime[3],
      'runtime.node.mem.heapUsed',
      memoryJson.heapUsed
    );
    ensureValue(recordsRuntime[4], 'runtime.node.mem.rss', memoryJson.rss);
  });

  it('should export Heap metrics', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heap');
    assert.strictEqual(records.length, 9);
    ensureValue(
      records[0],
      'runtime.node.heap.totalHeapSize',
      heapJson.total_heap_size
    );
    ensureValue(
      records[1],
      'runtime.node.heap.totalHeapSizeExecutable',
      heapJson.total_heap_size_executable
    );
    ensureValue(
      records[2],
      'runtime.node.heap.totalPhysicalSize',
      heapJson.total_physical_size
    );
    ensureValue(
      records[3],
      'runtime.node.heap.totalAvailableSize',
      heapJson.total_available_size
    );
    ensureValue(
      records[4],
      'runtime.node.heap.usedHeapSize',
      heapJson.used_heap_size
    );
    ensureValue(
      records[5],
      'runtime.node.heap.heapSizeLimit',
      heapJson.heap_size_limit
    );
    ensureValue(
      records[6],
      'runtime.node.heap.mallocedMemory',
      heapJson.malloced_memory
    );
    ensureValue(
      records[7],
      'runtime.node.heap.peakMallocedMemory',
      heapJson.peak_malloced_memory
    );
    ensureValue(
      records[8],
      'runtime.node.heap.doesZapGarbage',
      heapJson.does_zap_garbage
    );
  });

  it('should export Uptime metrics', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.process');
    assert.strictEqual(records.length, 1);
    ensureValue(records[0], 'runtime.node.process.upTime', mockedUptime);
  });

  it('should export Event Loop metrics', () => {
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.eventLoop.delay'
    );
    assert.strictEqual(records.length, 5);
    ensureValue(
      records[0],
      'runtime.node.eventLoop.delay.min',
      nativeJson.eventLoop.min
    );
    ensureValue(
      records[1],
      'runtime.node.eventLoop.delay.max',
      nativeJson.eventLoop.max
    );
    ensureValue(
      records[2],
      'runtime.node.eventLoop.delay.avg',
      nativeJson.eventLoop.avg
    );
    ensureValue(
      records[3],
      'runtime.node.eventLoop.delay.median',
      nativeJson.eventLoop.median
    );
    ensureValue(
      records[4],
      'runtime.node.eventLoop.delay.p95',
      nativeJson.eventLoop.p95
    );
  });

  it('should export Event Loop metrics', () => {
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.eventLoop.delay'
    );
    assert.strictEqual(records.length, 5);
    ensureValue(
      records[0],
      'runtime.node.eventLoop.delay.min',
      nativeJson.eventLoop.min
    );
    ensureValue(
      records[1],
      'runtime.node.eventLoop.delay.max',
      nativeJson.eventLoop.max
    );
    ensureValue(
      records[2],
      'runtime.node.eventLoop.delay.avg',
      nativeJson.eventLoop.avg
    );
    ensureValue(
      records[3],
      'runtime.node.eventLoop.delay.median',
      nativeJson.eventLoop.median
    );
    ensureValue(
      records[4],
      'runtime.node.eventLoop.delay.p95',
      nativeJson.eventLoop.p95
    );
  });

  it('should export Event Loop counter metrics', () => {
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.eventLoop.delayCounter'
    );
    assert.strictEqual(records.length, 3);
    ensureValue(
      records[0],
      'runtime.node.eventLoop.delayCounter.sum',
      nativeJson.eventLoop.sum
    );
    ensureValue(
      records[1],
      'runtime.node.eventLoop.delayCounter.total',
      nativeJson.eventLoop.total
    );
    ensureValue(
      records[2],
      'runtime.node.eventLoop.delayCounter.count',
      nativeJson.eventLoop.count
    );
  });

  it('should export Garbage Collector metrics "all"', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.gc.pause');
    assert.strictEqual(records.length, 5);
    ensureValue(records[0], 'runtime.node.gc.pause.min', nativeJson.gc.all.min);
    ensureValue(records[1], 'runtime.node.gc.pause.max', nativeJson.gc.all.max);
    ensureValue(records[2], 'runtime.node.gc.pause.avg', nativeJson.gc.all.avg);
    ensureValue(
      records[3],
      'runtime.node.gc.pause.median',
      nativeJson.gc.all.median
    );
    ensureValue(records[4], 'runtime.node.gc.pause.p95', nativeJson.gc.all.p95);
  });

  it('should export Garbage Collector metrics by type', () => {
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.gc.pause.by.type'
    );
    assert.strictEqual(records.length, 20);
  });

  it('should export Garbage Collector metrics by type "scavenge"', () => {
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.gc.pause.by.type'
    );
    ensureGCValues(records, 0, 4, 'scavenge', GC_VALUES);
  });

  it('should export Garbage Collector metrics by type "markSweepCompact"', () => {
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.gc.pause.by.type'
    );
    ensureGCValues(records, 1, 4, 'markSweepCompact', GC_VALUES);
  });

  it('should export Garbage Collector metrics by type "incrementalMarking"', () => {
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.gc.pause.by.type'
    );
    ensureGCValues(records, 2, 4, 'incrementalMarking', GC_VALUES);
  });

  it('should export Garbage Collector metrics by type "processWeakCallbacks"', () => {
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.gc.pause.by.type'
    );
    ensureGCValues(records, 3, 4, 'processWeakCallbacks', GC_VALUES);
  });

  it('should export heap spaces metrics', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    assert.strictEqual(records.length, 32);
  });

  it('should export heap spaces metrics for type "read_only_space"', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(records, 0, 8, 'read_only_space', HEAP_SPACE_VALUES);
  });

  it('should export heap spaces metrics for type "new_space"', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(records, 1, 8, 'new_space', HEAP_SPACE_VALUES);
  });

  it('should export heap spaces metrics for type "old_space"', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(records, 2, 8, 'old_space', HEAP_SPACE_VALUES);
  });

  it('should export heap spaces metrics for type "code_space"', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(records, 3, 8, 'code_space', HEAP_SPACE_VALUES);
  });

  it('should export heap spaces metrics for type "map_space"', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(records, 4, 8, 'map_space', HEAP_SPACE_VALUES);
  });

  it('should export heap spaces metrics for type "large_object_space"', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(
      records,
      5,
      8,
      'large_object_space',
      HEAP_SPACE_VALUES
    );
  });

  it('should export heap spaces metrics for type "code_large_object_space"', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(
      records,
      6,
      8,
      'code_large_object_space',
      HEAP_SPACE_VALUES
    );
  });

  it('should export heap spaces metrics for type "new_large_object_space"', () => {
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(
      records,
      7,
      8,
      'new_large_object_space',
      HEAP_SPACE_VALUES
    );
  });
});

function getRecords(records: MetricRecord[], name: string): MetricRecord[] {
  return records.filter(record => record.descriptor.name === name);
}

function ensureValue(record: MetricRecord, name: string, value: number) {
  assert.strictEqual(record.labels.name, name);
  const point = record.aggregator.toPoint();
  const aggValue =
    typeof point.value === 'number'
      ? point.value
      : (point.value as Histogram).sum;
  assert.strictEqual(aggValue, value);
}

function ensureGCValues(
  records: MetricRecord[],
  start: number,
  step: number,
  name: string,
  values: string[]
) {
  for (let i = 0, j = values.length; i < j; i++) {
    ensureValue(
      records[i * step + start],
      `runtime.node.gc.pause.by.type.${values[i]}`,
      nativeJson.gc[name][values[i]]
    );
  }
}

function ensureHeapSpaceValues(
  records: MetricRecord[],
  start: number,
  step: number,
  name: string,
  values: string[]
) {
  const space = nativeJson.heap.spaces.find(
    (space: any) => space.spaceName === name
  );
  for (let i = 0, j = values.length; i < j; i++) {
    ensureValue(
      records[i * step + start],
      `runtime.node.heapSpace.${values[i]}.by.space`,
      space[values[i]]
    );
  }
}
