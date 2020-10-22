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

const cpuJson = require('./mocks/cpu.json');
const networkJson = require('./mocks/network.json');
const memoryJson = require('./mocks/memory.json');

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

const mockedOS = {
  freemem: function () {
    return 7179869184;
  },
  totalmem: function () {
    return 17179869184;
  },
};

const INTERVAL = 3000;

let metrics: any;

describe('RCA Metrics', () => {
  let sandbox: sinon.SinonSandbox;
  let rcaMetrics: any;
  let exporter: MetricExporter;
  let exportSpy: any;

  beforeEach(done => {
    sandbox = sinon.createSandbox();
    sandbox.useFakeTimers();

    sandbox.stub(os, 'freemem').returns(mockedOS.freemem());
    sandbox.stub(os, 'totalmem').returns(mockedOS.totalmem());
    sandbox.stub(process, 'cpuUsage').returns(cpuJson);
    sandbox.stub(process, 'memoryUsage').returns(memoryJson);
    const spyNetworkStats = sandbox
      .stub(SI, 'networkStats')
      .returns(mockedSI.networkStats());

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
    rcaMetrics = new metrics.RCAMetrics({
      meterProvider,
      name: 'opentelemetry-rca-metrics',
    });
    rcaMetrics.start();

    // because networkStats mock simulates the network with every call it
    // returns the data that is bigger then previous, it needs to stub it again
    // as network is also called in initial start to start counting from 0
    spyNetworkStats.restore();
    sandbox.stub(SI, 'networkStats').returns(mockedSI.networkStats());

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
    assert.ok(rcaMetrics instanceof metrics.RCAMetrics);
  });

  it('should create a new instance with default meter provider', () => {
    rcaMetrics = new metrics.RCAMetrics({
      name: 'opentelemetry-rca-metrics',
    });
    rcaMetrics.start();
    assert.ok(rcaMetrics instanceof metrics.RCAMetrics);
  });

  it('should export CPU metrics', () => {
    const records = getRecords(exportSpy.args[0][0], 'cpu');
    assert.strictEqual(records.length, 4);
    ensureValue(records[0], 'cpu.user', 1.899243);
    ensureValue(records[1], 'cpu.sys', 0.258553);
    ensureValue(records[2], 'cpu.usage', 2.157796);
    ensureValue(records[3], 'cpu.total', 2.157796);
  });

  it('should export Network metrics', done => {
    const records = getRecords(exportSpy.args[0][0], 'net');
    assert.strictEqual(records.length, 2);
    ensureValue(records[0], 'net.bytesSent', 14207163202);
    ensureValue(records[1], 'net.bytesRecv', 60073930753);
    done();
  });

  it('should export Memory metrics', done => {
    const records = getRecords(exportSpy.args[0][0], 'mem');
    assert.strictEqual(records.length, 2);
    ensureValue(records[0], 'mem.available', mockedOS.freemem());
    ensureValue(records[1], 'mem.total', mockedOS.totalmem());
    done();
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
