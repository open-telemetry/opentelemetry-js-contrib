/*!
 * Copyright 2020, OpenTelemetry Authors
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
const SI = require('systeminformation');
import { ExportResult } from '@opentelemetry/core';
import { MetricExporter, MetricRecord } from '@opentelemetry/metrics';
import * as assert from 'assert';
import * as os from 'os';
import * as sinon from 'sinon';

const cpuJson = require('./mocks/cpu.json');
const networkJson = require('./mocks/network.json');
const nativeJson = require('./mocks/native.json');
const memoryJson = require('./mocks/memory.json');
const heapJson = require('./mocks/heap.json');

class NoopExporter implements MetricExporter {
  export(
    metrics: MetricRecord[],
    resultCallback: (result: ExportResult) => void
  ): void {}
  shutdown(): void {}
}

const originalSetTimeout = setTimeout;

const GC_VALUES = ['min', 'max', 'avg', 'median', 'p95'];
const HEAP_SPACE_VALUES = ['size', 'usedSize', 'availableSize', 'physicalSize'];
const mockedNative = {
  start: function() {},
  stats: function() {
    return nativeJson;
  },
};

let countSI = 0;
const mockedSI = {
  networkStats: function() {
    return new Promise((resolve, reject) => {
      countSI++;
      const stats: any[] = networkJson
        .slice()
        .map((obj: any) => Object.assign({}, obj));

      for (let i = 0, j = networkJson.length; i < j; i++) {
        Object.keys(stats[i]).forEach(key => {
          if (typeof stats[i][key] === 'number' && stats[i][key] > 0) {
            stats[i][key] = stats[i][key] * countSI;
          }
        });
      }
      resolve(stats);
    });
  },
};

const mockedOS = {
  freemem: function() {
    return 7179869184;
  },
  totalmem: function() {
    return 17179869184;
  },
};
const mockedUptime = 1405;

let metrics: any;

describe('metric', () => {
  let sandbox: sinon.SinonSandbox;
  let metricsCollector: any;
  let exporter: MetricExporter;
  let exportSpy: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.useFakeTimers();

    mock('node-gyp-build', function() {
      return mockedNative;
    });

    sandbox.stub(os, 'freemem').returns(mockedOS.freemem());
    sandbox.stub(os, 'totalmem').returns(mockedOS.totalmem());
    sandbox.stub(v8, 'getHeapStatistics').returns(heapJson);
    sandbox.stub(process, 'cpuUsage').returns(cpuJson);
    sandbox.stub(process, 'memoryUsage').returns(memoryJson);
    sandbox.stub(process, 'uptime').returns(mockedUptime);
    const spyNetworkStats = sandbox
      .stub(SI, 'networkStats')
      .returns(mockedSI.networkStats());

    exporter = new NoopExporter();
    exportSpy = sandbox.stub(exporter, 'export');

    // it seems like this is the only way to be able to mock
    // `node-gyp-build` before metrics are being loaded, if import them before
    // the first pass on unit tests will not mock correctly
    metrics = require('../src');
    metricsCollector = new metrics.MetricsCollector({
      exporter,
      intervalCollect: 3000,
      intervalExport: 3000,
      name: 'opentelemetry-metrics-collector',
      url: '',
    });
    metricsCollector.start();

    // because networkStats mock simulates the network with every call it
    // returns the data that is bigger then previous, it needs to stub it again
    // as network is also called in initial start to start counting from 0
    spyNetworkStats.restore();
    sandbox.stub(SI, 'networkStats').returns(mockedSI.networkStats());
  });
  afterEach(() => {
    sandbox.restore();
  });

  it('should create a new instance', () => {
    assert.ok(metricsCollector instanceof metrics.MetricsCollector);
  });

  it('should export CPU metrics', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(exportSpy.args[0][0], 'cpu');
    assert.strictEqual(records.length, 4);
    ensureValue(records[0], 'cpu.user', 1.899243);
    ensureValue(records[1], 'cpu.sys', 0.258553);
    ensureValue(records[2], 'cpu.usage', 2.157796);
    ensureValue(records[3], 'cpu.total', 2.157796);
  });

  it('should export Network metrics', done => {
    sandbox.clock.tick(3000);
    originalSetTimeout(() => {
      const records = getRecords(exportSpy.args[0][0], 'net');
      assert.strictEqual(records.length, 2);
      ensureValue(records[0], 'net.bytesSent', 14207163202);
      ensureValue(records[1], 'net.bytesRecv', 60073930753);
      done();
    }, 0);
  });

  it('should export Memory metrics', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(exportSpy.args[0][0], 'mem');
    assert.strictEqual(records.length, 2);

    ensureValue(records[0], 'mem.available', mockedOS.freemem());
    ensureValue(records[1], 'mem.total', mockedOS.totalmem());
  });

  it('should export Memory runtime metrics', () => {
    sandbox.clock.tick(3000);
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
    sandbox.clock.tick(3000);
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
    sandbox.clock.tick(3000);
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.process');
    assert.strictEqual(records.length, 1);
    ensureValue(records[0], 'runtime.node.process.upTime', mockedUptime);
  });

  it('should export Event Loop metrics', () => {
    sandbox.clock.tick(3000);
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
    sandbox.clock.tick(3000);
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
    sandbox.clock.tick(3000);
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
    sandbox.clock.tick(3000);
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
    sandbox.clock.tick(3000);
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.gc.pause.by.type'
    );
    assert.strictEqual(records.length, 20);
  });

  it('should export Garbage Collector metrics by type "scavenge"', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.gc.pause.by.type'
    );
    ensureGCValues(records, 0, 4, 'scavenge', GC_VALUES);
  });

  it('should export Garbage Collector metrics by type "markSweepCompact"', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.gc.pause.by.type'
    );
    ensureGCValues(records, 1, 4, 'markSweepCompact', GC_VALUES);
  });

  it('should export Garbage Collector metrics by type "incrementalMarking"', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.gc.pause.by.type'
    );
    ensureGCValues(records, 2, 4, 'incrementalMarking', GC_VALUES);
  });

  it('should export Garbage Collector metrics by type "processWeakCallbacks"', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(
      exportSpy.args[0][0],
      'runtime.node.gc.pause.by.type'
    );
    ensureGCValues(records, 3, 4, 'processWeakCallbacks', GC_VALUES);
  });

  it('should export heap spaces metrics', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    assert.strictEqual(records.length, 32);
  });

  it('should export heap spaces metrics for type "read_only_space"', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(records, 0, 8, 'read_only_space', HEAP_SPACE_VALUES);
  });

  it('should export heap spaces metrics for type "new_space"', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(records, 1, 8, 'new_space', HEAP_SPACE_VALUES);
  });

  it('should export heap spaces metrics for type "old_space"', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(records, 2, 8, 'old_space', HEAP_SPACE_VALUES);
  });

  it('should export heap spaces metrics for type "code_space"', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(records, 3, 8, 'code_space', HEAP_SPACE_VALUES);
  });

  it('should export heap spaces metrics for type "map_space"', () => {
    sandbox.clock.tick(3000);
    const records = getRecords(exportSpy.args[0][0], 'runtime.node.heapSpace');
    ensureHeapSpaceValues(records, 4, 8, 'map_space', HEAP_SPACE_VALUES);
  });

  it('should export heap spaces metrics for type "large_object_space"', () => {
    sandbox.clock.tick(3000);
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
    sandbox.clock.tick(3000);
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
    sandbox.clock.tick(3000);
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
  assert.strictEqual(point.value, value);
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
