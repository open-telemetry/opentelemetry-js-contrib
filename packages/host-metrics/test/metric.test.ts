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

import * as Network from 'systeminformation/lib/network';
import type { Systeminformation } from 'systeminformation';
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
import {
  ATTR_NETWORK_IO_DIRECTION,
  ATTR_PROCESS_CPU_STATE,
  ATTR_SYSTEM_CPU_LOGICAL_NUMBER,
  ATTR_SYSTEM_CPU_STATE,
  ATTR_SYSTEM_DEVICE,
  ATTR_SYSTEM_MEMORY_STATE,
} from '../src/semconv';
import { HostMetrics } from '../src';

const cpuJson = require('./mocks/cpu.json');
const processJson = require('./mocks/process.json');
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
    return new Promise<Systeminformation.NetworkStatsData[]>(
      (resolve, reject) => {
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
      }
    );
  },
};

const mockedOS = {
  freemem: function () {
    return 1024;
  },
  totalmem: function () {
    return 1024 * 1024;
  },
  cpusIdx: 0,
  cpus: function () {
    return cpuJson[this.cpusIdx++ % 2];
  },
};

const mockedProcess = {
  uptime: function () {
    return 0;
  },
  procIdx: 0,
  cpuUsage: function () {
    return processJson[this.procIdx++ % 2];
  },
  memoryUsage: {
    rss: function () {
      return 123456;
    },
  },
};

describe('Host Metrics', () => {
  let meterProvider: MeterProvider;

  afterEach(async () => {
    await meterProvider?.shutdown();
  });

  describe('constructor', () => {
    it('should create a new instance', () => {
      const hostMetrics = new HostMetrics();
      assert.ok(hostMetrics instanceof HostMetrics);
    });

    it('should create a new instance with default meter provider', () => {
      meterProvider = new MeterProvider();

      const hostMetrics = new HostMetrics({
        meterProvider,
      });
      hostMetrics.start();
      assert.ok(hostMetrics instanceof HostMetrics);
    });
  });

  describe('metrics', () => {
    let sandbox: sinon.SinonSandbox;
    let hostMetrics: HostMetrics;
    let reader: TestMetricReader;

    beforeEach(async () => {
      sandbox = sinon.createSandbox();
      sandbox.useFakeTimers();

      sandbox.stub(os, 'freemem').callsFake(mockedOS.freemem);
      sandbox.stub(os, 'totalmem').callsFake(mockedOS.totalmem);
      sandbox.stub(os, 'cpus').callsFake(() => mockedOS.cpus());
      sandbox.stub(process, 'uptime').callsFake(mockedProcess.uptime);
      sandbox
        .stub(process, 'cpuUsage')
        .callsFake(() => mockedProcess.cpuUsage());
      sandbox
        .stub(process.memoryUsage, 'rss')
        .callsFake(mockedProcess.memoryUsage.rss);
      sandbox.stub(Network, 'networkStats').callsFake(mockedSI.networkStats);

      reader = new TestMetricReader();

      meterProvider = new MeterProvider({
        readers: [reader],
      });

      hostMetrics = new HostMetrics({
        meterProvider,
        name: '', // to get default instrumentation scope name
      });

      await hostMetrics.start();

      // Drop first frame cpu metrics, see
      // src/common.ts getCpuUsageData/getProcessCpuUsageData
      await reader.collect();

      // advance the clock for the next collection
      sandbox.clock.tick(1000);

      // invalidates throttles
      countSI = 0;
    });
    afterEach(() => {
      sandbox.restore();
    });

    it('should export CPU time metrics', async () => {
      const metric = await getRecords(reader, 'system.cpu.time');

      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'user',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '0',
        },
        90714.26
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'system',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '0',
        },
        63192.83
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'idle',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '0',
        },
        374870.8
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'interrupt',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '0',
        },
        0
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'nice',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '0',
        },
        0
      );

      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'user',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '1',
        },
        11005.72
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'system',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '1',
        },
        7678.62
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'idle',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '1',
        },
        510035
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'interrupt',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '1',
        },
        0
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'nice',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '1',
        },
        0
      );
    });

    it('should export CPU utilization metrics', async () => {
      const metric = await getRecords(reader, 'system.cpu.utilization');

      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'user',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '0',
        },
        0.7
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'system',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '0',
        },
        0.2
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'idle',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '0',
        },
        0.1
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'interrupt',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '0',
        },
        0
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'nice',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '0',
        },
        0
      );

      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'user',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '1',
        },
        0.3
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'system',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '1',
        },
        0.5
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'idle',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '1',
        },
        0.2
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'interrupt',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '1',
        },
        0
      );
      ensureValue(
        metric,
        {
          [ATTR_SYSTEM_CPU_STATE]: 'nice',
          [ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: '1',
        },
        0
      );
    });

    it('should export Memory usage metrics', async () => {
      const metric = await getRecords(reader, 'system.memory.usage');

      ensureValue(
        metric,
        { [ATTR_SYSTEM_MEMORY_STATE]: 'used' },
        1024 * 1024 - 1024
      );
      ensureValue(metric, { [ATTR_SYSTEM_MEMORY_STATE]: 'free' }, 1024);
    });

    it('should export Memory utilization metrics', async () => {
      const metric = await getRecords(reader, 'system.memory.utilization');

      ensureValue(metric, { [ATTR_SYSTEM_MEMORY_STATE]: 'used' }, 0.9990234375);
      ensureValue(metric, { [ATTR_SYSTEM_MEMORY_STATE]: 'free' }, 0.0009765625);
    });

    it('should export Network io dropped', async () => {
      const metric = await getRecords(reader, 'system.network.dropped');

      ensureValue(
        metric,
        {
          [ATTR_NETWORK_IO_DIRECTION]: 'receive',
          [ATTR_SYSTEM_DEVICE]: 'eth0',
        },
        1200
      );
      ensureValue(
        metric,
        {
          [ATTR_NETWORK_IO_DIRECTION]: 'transmit',
          [ATTR_SYSTEM_DEVICE]: 'eth0',
        },
        12
      );
    });

    it('should export Network io errors', async () => {
      const metric = await getRecords(reader, 'system.network.errors');

      ensureValue(
        metric,
        {
          [ATTR_NETWORK_IO_DIRECTION]: 'receive',
          [ATTR_SYSTEM_DEVICE]: 'eth0',
        },
        3
      );
      ensureValue(
        metric,
        {
          [ATTR_NETWORK_IO_DIRECTION]: 'transmit',
          [ATTR_SYSTEM_DEVICE]: 'eth0',
        },
        15
      );
    });

    it('should export Network io bytes', async () => {
      const metric = await getRecords(reader, 'system.network.io');

      ensureValue(
        metric,
        {
          [ATTR_NETWORK_IO_DIRECTION]: 'receive',
          [ATTR_SYSTEM_DEVICE]: 'eth0',
        },
        123123
      );
      ensureValue(
        metric,
        {
          [ATTR_NETWORK_IO_DIRECTION]: 'transmit',
          [ATTR_SYSTEM_DEVICE]: 'eth0',
        },
        321321
      );
    });

    it('should export Process CPU time metrics', async () => {
      const metric = await getRecords(reader, 'process.cpu.time');

      ensureValue(metric, { [ATTR_PROCESS_CPU_STATE]: 'user' }, 90.71356);
      ensureValue(
        metric,
        { [ATTR_PROCESS_CPU_STATE]: 'system' },
        63.192629999999994
      );
    });

    it('should export Process CPU utilization metrics', async () => {
      const metric = await getRecords(reader, 'process.cpu.utilization');

      ensureValue(metric, { [ATTR_PROCESS_CPU_STATE]: 'user' }, 0.025);
      ensureValue(metric, { [ATTR_PROCESS_CPU_STATE]: 'system' }, 0.05);
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
  assert.strictEqual(
    scopeMetrics.scope.name,
    '@opentelemetry/host-metrics',
    'default instrumentation scope name is the package name'
  );
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
