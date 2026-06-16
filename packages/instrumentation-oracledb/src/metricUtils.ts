/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2025, 2026, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

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
  hrTimeToMilliseconds,
} from '@opentelemetry/core'
import { PoolConnectionsCounter } from './types';
import * as oracleDBTypes from 'oracledb';
import { ATTR_DB_CLIENT_CONNECTION_POOL_NAME, 
  ATTR_DB_CLIENT_CONNECTION_STATE, 
  DB_CLIENT_CONNECTION_STATE_VALUE_IDLE, 
  DB_CLIENT_CONNECTION_STATE_VALUE_USED } from './semconv';

let _operationDuration: Histogram
let _connectionsCount: UpDownCounter;
let _connectionPendingRequests: UpDownCounter;
let _connectionsTimeouts!: Counter;
let _connectionHits!: Counter;
let _connectionMisses!: Counter;
let _connectionsCounter: Record<string, PoolConnectionsCounter> = {};

// To be discussed
export function getPoolName(pool: any):string{
  if (pool.poolAlias) return pool.poolAlias;
  if(pool.connectString)
    return `${pool.connectString}_${pool.user}`
  return 'default';
}  

// TO be discussed
export function getOperationName(statement: string | undefined, isBatch: boolean):string{
  if (!statement || typeof statement !== "string") return "UNKNOWN";

  const normalized = statement.trim().replace(/\s+/g, " ");
  if (/^(BEGIN|DECLARE)\b/i.test(normalized)) {
    return isBatch ? "BATCH PLSQL" : "PLSQL";
  }
  const firstWord = normalized.split(" ")[0].replace(/;$/, "").toUpperCase();
  const opName = firstWord || "UNKNOWN";

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
    'db.client.connection.timeouts',
    {
      description:
        'The number of connection timeouts that have occurred trying to obtain a connection from the pool.',
      unit: '{timeout}',
    }
  );

  _connectionHits = meter.createCounter(
    'db.client.connection.hits', //TODO:: to be added in semantic convention
    {
      description:
        'The number of requests that got a connection from the already available free connections from the pool.',
      unit: '{request}',
    }
  );

  _connectionMisses = meter.createCounter(
    'db.client.connection.misses', //TODO:: to be added in semantic convention
    {
      description:
        'The number of requests that got a connection from newly created open connections from the pool.',
      unit: '{request}',
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

export function updateCounter(pool:oracleDBTypes.Pool) {
  if (!pool) return;
  const poolName = getPoolName(pool)

  const latest = _connectionsCounter[poolName] ||
    { idle: 0, used: 0, pending: 0, timeouts: 0 };

  // fetch stats values from pool
  const metrics =
    pool.status === oracleDBTypes.POOL_STATUS_OPEN
      ? {
          used: pool.connectionsInUse,
          idle: pool.connectionsOpen - pool.connectionsInUse,
          pending: pool.getStatistics()?.currentQueueLength,
          timeouts: pool.getStatistics()?.requestTimeouts,
        }
      : { used: 0, idle: 0, pending: 0, timeouts: 0 };

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

export function updateConnHits(pool:oracleDBTypes.Pool){
  if(!pool) return;
  const poolName = getPoolName(pool);
  const attributes  = {
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolName,
  }
  _connectionHits.add(1, attributes);
}

export function updateConnMisses(pool:oracleDBTypes.Pool){
  if(!pool) return;
  const poolName = getPoolName(pool);
  const attributes  = {
    [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolName,
  }
  _connectionMisses.add(1, attributes);
}

export function recordOperationDuration(metricsAttributes: Attributes, startExecTime: HrTime) {
  const durationSeconds =
   hrTimeToMilliseconds(hrTimeDuration(startExecTime, hrTime())) / 1000;
  _operationDuration.record(durationSeconds, metricsAttributes);
}
