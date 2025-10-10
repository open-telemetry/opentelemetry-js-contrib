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
  Counter,
  HrTime,
  Histogram,
  UpDownCounter,
} from '@opentelemetry/api';
import { SpanConnectionConfig, PoolConnectionsCounter } from './types';
import * as oracleDBTypes from 'oracledb';
import { ATTR_DB_CLIENT_CONNECTION_POOL_NAME, ATTR_DB_CLIENT_CONNECTION_STATE, DB_CLIENT_CONNECTION_STATE_VALUE_IDLE, DB_CLIENT_CONNECTION_STATE_VALUE_USED } from './semconv';
import { PoolMetricsInput } from './internal-types';

let _operationDuration: Histogram
let _connectionsCount: UpDownCounter;
let _connectionPendingRequests: UpDownCounter;
let _connectionsTimeouts!: Counter;
let _dbClientConnectionCreateTime!: Histogram;
let _dbClientConnectionUseTime!: Histogram;
let _dbClientConnectionWaitTime!: Histogram;
let _connectionsCounter: Record<string, PoolConnectionsCounter> = {};

// It returns db.namespace as mentioned in semantic conventions
// Ex: ORCL1|PDB1|db_high.adb.oraclecloud.com
export function getDBNameSpace(
  instanceName?: string,
  pdbName?: string,
  serviceName?: string
): string | undefined {
  if (instanceName == null && pdbName == null && serviceName == null) {
    return undefined;
  }
  return `${instanceName ?? ''}|${pdbName ?? ''}|${serviceName ?? ''}`;
}

export function getPoolName(config: SpanConnectionConfig, pool : any):string{
  // const dbNameSpace = getDBNameSpace(config.instanceName, config.pdbName, config.serviceName)
   const port = config.port ?? 1521;
  if (pool.poolAlias) return pool.poolAlias;
  if(config.connectString)
    return `${config.connectString}_${config.user}`
  return `${config.hostName}:,${port.toString()},'/',${config.serviceName}_${config.user}`
}  

export function _setMetricInstruments(meter: any) {
  _connectionsCount = meter.createUpDownCounter(
    'db.client.connection.count',
    {
      description:
        'The number of connections that are currently in state described by the state attribute.',
      unit: '{connection}',
    }
  );

  _connectionPendingRequests = meter.createUpDownCounter(
    'db.client.connection.pending_requests',
    {
      description:
        'The number of current pending requests for an open connection.',
      unit: '{request}',
    }
  );

  _connectionsTimeouts = meter.createCounter(
    'db.client.connection.timeouts', //TODO:: use semantic convention
    {
      description:
        'The number of connection timeouts that have occurred trying to obtain a connection from the pool.',
      unit: '{timeout}',
    }
  );

  _operationDuration = meter.createHistogram(
    'db.client.operation.duration',
    {
      description: 'Duration of database client operations.',
      unit: 's',
      valueType: 1,
      advice: {
        explicitBucketBoundaries: [
          0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10,
        ],
      },
    }
  );

  Object.keys(_connectionsCounter).forEach((p) => {
    _connectionsCounter[p] = { used: 0, idle: 0, pending: 0, timeouts: 0 };
  });
}

export function updateCounter({ pool, poolAlias, openConns, inUseConns }: 
  PoolMetricsInput) {
  if (!poolAlias) return;

  const latest = _connectionsCounter[poolAlias] ||
    { idle: 0, used: 0, pending: 0, timeouts: 0 };

  // derive unified values from either pool or numbers
  // full pool object can not be obtained from thin pool
  const metrics =
    pool && pool.status === oracleDBTypes.POOL_STATUS_OPEN
      ? {
          used: pool.connectionsInUse,
          idle: pool.connectionsOpen - pool.connectionsInUse,
          pending: pool.getStatistics()?.currentQueueLength,
          timeouts: pool.getStatistics()?.requestTimeouts,
        }
      : pool ? { used: 0, idle: 0, pending: 0, timeouts: 0 }
      : openConns !== undefined && inUseConns !== undefined
      ? {
          used: inUseConns,
          idle: openConns - inUseConns,
          pending: latest.pending,
          timeouts: latest.timeouts,
        }
      : latest;

  // all delta calculation at once
  const delta = {
    used: metrics.used - latest.used,
    idle: metrics.idle - latest.idle,
    pending: metrics.pending - latest.pending,
    timeouts: metrics.timeouts - latest.timeouts,
  };

  // apply deltas & update counters
  _connectionsCount.add(delta.used, {
    [ATTR_DB_CLIENT_CONNECTION_STATE]: DB_CLIENT_CONNECTION_STATE_VALUE_USED,
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolAlias,
  });
  _connectionsCount.add(delta.idle, {
    [ATTR_DB_CLIENT_CONNECTION_STATE]: DB_CLIENT_CONNECTION_STATE_VALUE_IDLE,
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolAlias,
  });
  _connectionPendingRequests.add(delta.pending, {
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolAlias,
  });
  _connectionsTimeouts.add(delta.timeouts, {
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolAlias,
  });

  _connectionsCounter[poolAlias] = metrics;
  console.log(`[PoolMetrics] ${poolAlias}`, metrics);
}


export function getLatency(endTime: HrTime) {
  const [seconds, nanoseconds] = endTime;
  return seconds * 1000 + nanoseconds / 1e6;
}

export {
  _operationDuration,
  _connectionsCount,
  _connectionPendingRequests,
  _connectionsTimeouts,
  _dbClientConnectionCreateTime,
  _dbClientConnectionUseTime,
  _dbClientConnectionWaitTime,
};
