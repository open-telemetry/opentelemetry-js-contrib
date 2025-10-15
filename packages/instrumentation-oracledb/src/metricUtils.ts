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
 *
 * Copyright (c) 2025, Oracle and/or its affiliates.
 * */
import {
  Counter,
  HrTime,
  Histogram,
  UpDownCounter,
  Attributes,
} from '@opentelemetry/api';
import {
  hrTime,
  hrTimeDuration,
  hrTimeToMilliseconds
} from '@opentelemetry/core'
import { PoolConnectionsCounter } from './types';
import * as oracleDBTypes from 'oracledb';
import { ATTR_DB_CLIENT_CONNECTION_POOL_NAME, ATTR_DB_CLIENT_CONNECTION_STATE, DB_CLIENT_CONNECTION_STATE_VALUE_IDLE, DB_CLIENT_CONNECTION_STATE_VALUE_USED } from './semconv';
import { PoolConnectConfig, PoolMetricsInput } from './internal-types';
import { ATTR_DB_NAMESPACE, ATTR_DB_OPERATION_NAME, ATTR_ERROR_TYPE, ATTR_SERVER_ADDRESS, ATTR_SERVER_PORT } from '@opentelemetry/semantic-conventions';

let _operationDuration: Histogram
let _connectionsCount: UpDownCounter;
let _connectionPendingRequests: UpDownCounter;
let _connectionsTimeouts!: Counter;
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

export function getPoolName(config: PoolConnectConfig):string{
  if (config.poolName) return config.poolName;
  if(config.connectString)
    return `${config.connectString}_${config.user}_pool#${Date.now()}`
  return 'default';
}  

export function getOperationName(statement: string | undefined, isBatch: boolean):string{
  if (!statement || typeof statement !== "string") return "UNKNOWN";

  // Trim and normalize spaces
  const normalized = statement.trim().replace(/\s+/g, " ");

  // Detect PL/SQL block (anonymous block)
  if (/^(BEGIN|DECLARE)\b/i.test(normalized)) {
    return isBatch ? "BATCH PLSQL" : "PLSQL";
  }
  // Extract the first SQL keyword
  const firstWord = normalized.split(" ")[0].replace(/;$/, "").toUpperCase();

  // For consistency, uppercase the operation name
  const opName = firstWord || "UNKNOWN";

  // Handle batch prefix
  return isBatch ? `BATCH ${opName}` : opName;
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

export function updateCounter({ pool, poolName, openConns, inUseConns }: 
  PoolMetricsInput) {
  if (!poolName) return;

  const latest = _connectionsCounter[poolName] ||
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
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolName,
  });
  _connectionsCount.add(delta.idle, {
    [ATTR_DB_CLIENT_CONNECTION_STATE]: DB_CLIENT_CONNECTION_STATE_VALUE_IDLE,
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolName,
  });
  _connectionPendingRequests.add(delta.pending, {
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolName,
  });
  _connectionsTimeouts.add(delta.timeouts, {
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolName,
  });

  _connectionsCounter[poolName] = metrics;
}

export function recordOperationDuration(attributes: Attributes, startExecTime: HrTime) {
  const metricsAttributes: Attributes = {};
  const keysToCopy: string[] = [
    ATTR_DB_NAMESPACE,
    ATTR_ERROR_TYPE,
    ATTR_SERVER_PORT,
    ATTR_SERVER_ADDRESS,
    ATTR_DB_OPERATION_NAME,
  ];
  keysToCopy.forEach(key => {
    if (key in attributes) {
      metricsAttributes[key] = attributes[key];
    }
  });
  const durationSeconds =
   hrTimeToMilliseconds(hrTimeDuration(startExecTime, hrTime())) / 1000;
  _operationDuration.record(durationSeconds, metricsAttributes);
}
