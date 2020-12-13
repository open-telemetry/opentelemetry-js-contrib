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

const SI = require('systeminformation');
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
import { HostMetrics } from '../src';

const cpuJson = require('./mocks/cpu.json');
const networkJson = require('./mocks/network.json');

class NoopExporter implements MetricExporter {
  export(
    metrics: MetricRecord[],
    resultCallback: (result: ExportResult) => void
  ): void {}

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

const originalSetTimeout = setTimeout;

let countSI = 0;
const mockedSI = {
  networkStats: function () {
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
let memoryCallCount = 0;
const mockedOS = {
  freemem: function () {
    memoryCallCount++;
    return 7179869184 + 1024 * memoryCallCount;
  },
  totalmem: function () {
    return 17179869184;
  },
};

const INTERVAL = 3000;

describe('Host Metrics', () => {
  let sandbox: sinon.SinonSandbox;
  let hostMetrics: any;
  let exporter: MetricExporter;
  let exportSpy: any;

  beforeEach(done => {
    sandbox = sinon.createSandbox();
    sandbox.useFakeTimers();

    sandbox.stub(os, 'freemem').callsFake(() => {
      return mockedOS.freemem();
    });
    sandbox.stub(os, 'totalmem').returns(mockedOS.totalmem());
    sandbox.stub(process, 'cpuUsage').returns(cpuJson);
    sandbox.stub(process, 'uptime').returns(0);
    sandbox.stub(SI, 'networkStats').callsFake(() => {
      return mockedSI.networkStats();
    });

    exporter = new NoopExporter();
    exportSpy = sandbox.stub(exporter, 'export');

    const meterProvider = new MeterProvider({
      interval: INTERVAL,
      exporter,
    });

    hostMetrics = new HostMetrics({
      meterProvider,
      name: 'opentelemetry-host-metrics',
    });
    hostMetrics.start();

    countSI = 0;

    // sinon fake doesn't work fine with setImmediate
    originalSetTimeout(() => {
      // move the clock with the same value as interval
      sandbox.clock.tick(INTERVAL * 2);
      // move to "real" next tick so that async batcher observer will start
      // processing metrics
      originalSetTimeout(() => {
        // allow all callbacks to finish correctly as they are finishing in
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
    assert.ok(hostMetrics instanceof HostMetrics);
  });

  it('should create a new instance with default meter provider', () => {
    const meterProvider = new MeterProvider({
      interval: INTERVAL,
      exporter,
    });

    hostMetrics = new HostMetrics({
      meterProvider,
      name: 'opentelemetry-host-metrics',
    });
    hostMetrics.start(true);
    assert.ok(hostMetrics instanceof HostMetrics);
  });

  it('should export CPU time metrics', () => {
    const records = getRecords(exportSpy.args[0][0], 'system.cpu.time');
    assert.strictEqual(records.length, 3);
    ensureValue(records[0], { state: 'user' }, 1.899243);
    ensureValue(records[1], { state: 'system' }, 0.258553);
    ensureValue(records[2], { state: 'idle' }, 3.8422039999999997);
  });

  it('should export CPU utilization metrics', () => {
    const records = getRecords(exportSpy.args[0][0], 'system.cpu.utilization');
    assert.strictEqual(records.length, 3);
    ensureValue(records[0], { state: 'user' }, 0.3165405);
    ensureValue(records[1], { state: 'system' }, 0.04309216666666666);
    ensureValue(records[2], { state: 'idle' }, 0.6403673333333333);
  });

  it('should export Memory usage metrics', done => {
    const records = getRecords(exportSpy.args[0][0], 'system.memory.usage');
    assert.strictEqual(records.length, 2);
    ensureValue(records[0], { state: 'used' }, 9999983616);
    ensureValue(records[1], { state: 'free' }, 7179885568);
    done();
  });

  it('should export Memory utilization metrics', done => {
    const records = getRecords(
      exportSpy.args[0][0],
      'system.memory.utilization'
    );
    assert.strictEqual(records.length, 2);
    ensureValue(records[0], { state: 'used' }, 0.5820754766464233);
    ensureValue(records[1], { state: 'free' }, 0.41792452335357666);
    done();
  });

  it('should export Network io dropped', done => {
    const records = getRecords(exportSpy.args[0][0], 'system.network.dropped');
    assert.strictEqual(records.length, 2);
    ensureValue(records[0], { direction: 'receive', device: 'eth0' }, 2400);
    ensureValue(records[1], { direction: 'transmit', device: 'eth0' }, 24);
    done();
  });

  it('should export Network io errors', done => {
    const records = getRecords(exportSpy.args[0][0], 'system.network.errors');
    assert.strictEqual(records.length, 2);
    ensureValue(records[0], { direction: 'receive', device: 'eth0' }, 6);
    ensureValue(records[1], { direction: 'transmit', device: 'eth0' }, 30);
    done();
  });

  it('should export Network io bytes', done => {
    const records = getRecords(exportSpy.args[0][0], 'system.network.io');
    assert.strictEqual(records.length, 2);
    ensureValue(records[0], { direction: 'receive', device: 'eth0' }, 246246);
    ensureValue(records[1], { direction: 'transmit', device: 'eth0' }, 642642);
    done();
  });
});

function getRecords(records: MetricRecord[], name: string): MetricRecord[] {
  return records.filter(record => record.descriptor.name === name);
}

function ensureValue(
  record: MetricRecord,
  labels: Record<string, string>,
  value: number
) {
  assert.deepStrictEqual(record.labels, labels);
  const point = record.aggregator.toPoint();
  const aggValue =
    typeof point.value === 'number'
      ? point.value
      : (point.value as Histogram).sum;
  assert.strictEqual(aggValue, value);
}
