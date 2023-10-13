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
import { Attributes } from '@opentelemetry/api';
import {
  AggregationTemporality,
  DataPoint,
  Histogram,
  MeterProvider,
  MetricData,
  MetricReader,
} from '@opentelemetry/sdk-metrics';
import * as assert from 'assert';
import * as os from 'os';
import * as sinon from 'sinon';
import { HostMetrics } from '../src';

const cpuJson = require('./mocks/cpu.json');
const networkJson = require('./mocks/network.json');

class TestMetricReader extends MetricReader {
  public override selectAggregationTemporality(): AggregationTemporality {
    return AggregationTemporality.CUMULATIVE;
  }
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

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
    return 1024;
  },
  totalmem: function () {
    return 1024 * 1024;
  },
};

const ELAPSED_TIME = 1000;

describe('Host Metrics', () => {
  let meterProvider: MeterProvider;

  afterEach(async () => {
    await meterProvider?.shutdown();
  });

  describe('constructor', () => {
    it('should create a new instance', () => {
      const hostMetrics = new HostMetrics({
        name: 'opentelemetry-host-metrics',
      });
      assert.ok(hostMetrics instanceof HostMetrics);
    });

    it('should create a new instance with default meter provider', () => {
      meterProvider = new MeterProvider();

      const hostMetrics = new HostMetrics({
        meterProvider,
        name: 'opentelemetry-host-metrics',
      });
      hostMetrics.start();
      assert.ok(hostMetrics instanceof HostMetrics);
    });
  });

  describe('metrics', () => {
    let sandbox: sinon.SinonSandbox;
    let hostMetrics: HostMetrics;
    let reader: TestMetricReader;
    let metricsTaken = 0;

    beforeEach(async () => {
      sandbox = sinon.createSandbox();
      sandbox.useFakeTimers();

      sandbox.stub(os, 'freemem').callsFake(() => {
        return mockedOS.freemem();
      });
      sandbox.stub(os, 'totalmem').returns(mockedOS.totalmem());
      sandbox.stub(os, 'cpus').callsFake(() => cpuJson.map((cpu: any) => {
        const { model, speed, times } = cpu;
        return {
          model,
          speed,
          times: {
            user: times.user + (ELAPSED_TIME * 0.6) * metricsTaken,
            nice: times.nice,
            sys: times.sys + (ELAPSED_TIME * 0.3) * metricsTaken,
            idle: times.idle + (ELAPSED_TIME * 0.1) * metricsTaken,
            irq: times.irq,
          },
        };
      }))
      sandbox.stub(process, 'uptime').returns(0);
      sandbox.stub(SI, 'networkStats').callsFake(() => {
        return mockedSI.networkStats();
      });
      sandbox.stub(process, 'cpuUsage').callsFake(() => {
        return {
          user: 90713560,
          system: 63192630,
        };
      });
      sandbox.stub(process.memoryUsage, 'rss').callsFake(() => {
        return 123456;
      });

      reader = new TestMetricReader();

      meterProvider = new MeterProvider();
      meterProvider.addMetricReader(reader);

      hostMetrics = new HostMetrics({
        meterProvider,
        name: 'opentelemetry-host-metrics',
      });
      await hostMetrics.start();

      // Drop first frame cpu metrics, see
      // src/common.ts getCpuUsageData
      await reader.collect();

      // invalidates throttles
      countSI = 0;
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('should export CPU time metrics', async () => {
      const metric = await getRecords(reader, 'system.cpu.time');

      ensureValue(metric, { state: 'user', cpu: '0' }, 90713.56);
      ensureValue(metric, { state: 'system', cpu: '0' }, 63192.630000000005);
      ensureValue(metric, { state: 'idle', cpu: '0' }, 374870.7);
      ensureValue(metric, { state: 'interrupt', cpu: '0' }, 0);
      ensureValue(metric, { state: 'nice', cpu: '0' }, 0);

      ensureValue(metric, { state: 'user', cpu: '1' }, 11005.42);
      ensureValue(metric, { state: 'system', cpu: '1' }, 7678.12);
      ensureValue(metric, { state: 'idle', cpu: '1' }, 510034.8);
      ensureValue(metric, { state: 'interrupt', cpu: '1' }, 0);
      ensureValue(metric, { state: 'nice', cpu: '1' }, 0);
    });

    it('should export CPU utilization metrics', async () => {
      metricsTaken++;
      sandbox.clock.tick(1000);
      const metric = await getRecords(reader, 'system.cpu.utilization');

      ensureValue(metric, { state: 'user', cpu: '0' }, 0.6);
      ensureValue(metric, { state: 'system', cpu: '0' }, 0.3);
      ensureValue(metric, { state: 'idle', cpu: '0' }, 0.1);
      ensureValue(metric, { state: 'interrupt', cpu: '0' }, 0);
      ensureValue(metric, { state: 'nice', cpu: '0' }, 0);

      ensureValue(metric, { state: 'user', cpu: '1' }, 0.6);
      ensureValue(metric, { state: 'system', cpu: '1' }, 0.3);
      ensureValue(metric, { state: 'idle', cpu: '1' }, 0.1);
      ensureValue(metric, { state: 'interrupt', cpu: '1' }, 0);
      ensureValue(metric, { state: 'nice', cpu: '1' }, 0);
    });

    it('should export Memory usage metrics', async () => {
      const metric = await getRecords(reader, 'system.memory.usage');

      ensureValue(metric, { state: 'used' }, 1024 * 1024 - 1024);
      ensureValue(metric, { state: 'free' }, 1024);
    });

    it('should export Memory utilization metrics', async () => {
      const metric = await getRecords(reader, 'system.memory.utilization');

      ensureValue(metric, { state: 'used' }, 0.9990234375);
      ensureValue(metric, { state: 'free' }, 0.0009765625);
    });

    it('should export Network io dropped', async () => {
      const metric = await getRecords(reader, 'system.network.dropped');

      ensureValue(metric, { direction: 'receive', device: 'eth0' }, 1200);
      ensureValue(metric, { direction: 'transmit', device: 'eth0' }, 12);
    });

    it('should export Network io errors', async () => {
      const metric = await getRecords(reader, 'system.network.errors');

      ensureValue(metric, { direction: 'receive', device: 'eth0' }, 3);
      ensureValue(metric, { direction: 'transmit', device: 'eth0' }, 15);
    });

    it('should export Network io bytes', async () => {
      const metric = await getRecords(reader, 'system.network.io');

      ensureValue(metric, { direction: 'receive', device: 'eth0' }, 123123);
      ensureValue(metric, { direction: 'transmit', device: 'eth0' }, 321321);
    });

    it.skip('should export Process CPU time metrics', async () => {
      const metric = await getRecords(reader, 'process.cpu.time');

      ensureValue(metric, { state: 'user' }, 90713.56);
      ensureValue(metric, { state: 'system' }, 63192.630000000005);
    });

    it.skip('should export Process CPU utilization metrics', async () => {
      const metric = await getRecords(reader, 'process.cpu.utilization');

      ensureValue(metric, { state: 'user' }, 30247.935978659552);
      ensureValue(metric, { state: 'system' }, 21071.23374458153);
    });

    it('should export Process Memory usage metrics', async () => {
      const metric = await getRecords(reader, 'process.memory.usage');

      ensureValue(metric, {}, 123456);
    });
  });
});

async function getRecords(
  metricReader: MetricReader,
  name: string
): Promise<MetricData> {
  const collectionResult = await metricReader.collect();
  assert(collectionResult != null);
  assert.strictEqual(collectionResult.resourceMetrics.scopeMetrics.length, 1);
  const scopeMetrics = collectionResult.resourceMetrics.scopeMetrics[0];
  const metricDataList = scopeMetrics.metrics.filter(
    metric => metric.descriptor.name === name
  );
  assert.strictEqual(metricDataList.length, 1);
  return metricDataList[0];
}

function ensureValue(
  metric: MetricData,
  attributes: Attributes,
  value: number
) {
  const attrHash = hashAttributes(attributes);
  const matches = (metric.dataPoints as DataPoint<unknown>[]).filter(it => {
    return attrHash === hashAttributes(it.attributes);
  });
  assert.strictEqual(matches.length, 1);
  const point = matches[0];
  const aggValue =
    typeof point.value === 'number'
      ? point.value
      : (point.value as Histogram).sum;
  assert.strictEqual(aggValue, value);
}

function hashAttributes(attributes: Attributes) {
  return Object.entries(attributes)
    .sort(([a], [b]) => {
      return a < b ? -1 : 1;
    })
    .map(pair => `${pair[0]}:${pair[1]}`)
    .join('#');
}
