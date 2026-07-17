/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2025, 2026, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Attributes,
  Counter,
  Histogram,
  HrTime,
  Meter,
  UpDownCounter,
} from '@opentelemetry/api';
import {
  hrTime,
  hrTimeDuration,
  hrTimeToMilliseconds,
} from '@opentelemetry/core';
import { METRIC_DB_CLIENT_OPERATION_DURATION } from '@opentelemetry/semantic-conventions';
import * as oracleDBTypes from 'oracledb';
import {
  ATTR_DB_CLIENT_CONNECTION_POOL_NAME,
  ATTR_DB_CLIENT_CONNECTION_STATE,
  DB_CLIENT_CONNECTION_STATE_VALUE_IDLE,
  DB_CLIENT_CONNECTION_STATE_VALUE_USED,
  METRIC_DB_CLIENT_CONNECTION_COUNT,
  METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS,
  METRIC_DB_CLIENT_CONNECTION_TIMEOUTS,
} from './semconv';

let _operationDuration!: Histogram;
let _connectionsCount!: UpDownCounter;
let _connectionPendingRequests!: UpDownCounter;
let _connectionsTimeouts!: Counter;
const _connectionsCounter: Record<string, PoolConnectionsCounter> = {};

export interface PoolConnectionsCounter {
  idle: number;
  pending: number;
  used: number;
  timeouts: number;
}

// To be discussed
export function getPoolName(
  pool: oracleDBTypes.Pool & { connectString?: string }
): string {
  const poolAlias = pool.poolAlias?.trim();
  if (poolAlias) return poolAlias;

  return pool.connectString!.trim();
}

export function _setMetricInstruments(meter: Meter) {
  _connectionsCount = meter.createUpDownCounter(
    METRIC_DB_CLIENT_CONNECTION_COUNT,
    {
      description:
        'The number of connections that are currently in state described by the state attribute.',
      unit: '{connection}',
    }
  );

  _connectionPendingRequests = meter.createUpDownCounter(
    METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS,
    {
      description:
        'The number of current pending requests for an open connection.',
      unit: '{request}',
    }
  );

  _connectionsTimeouts = meter.createCounter(
    METRIC_DB_CLIENT_CONNECTION_TIMEOUTS,
    {
      description:
        'The number of connection timeouts that have occurred trying to obtain a connection from the pool.',
      unit: '{timeout}',
    }
  );

  _operationDuration = meter.createHistogram(
    METRIC_DB_CLIENT_OPERATION_DURATION,
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

  Object.keys(_connectionsCounter).forEach(p => {
    _connectionsCounter[p] = { used: 0, idle: 0, pending: 0, timeouts: 0 };
  });
}

export function updateCounter(pool: oracleDBTypes.Pool) {
  if (!pool) return;
  const poolName = getPoolName(pool);

  const latest = _connectionsCounter[poolName] || {
    idle: 0,
    used: 0,
    pending: 0,
    timeouts: 0,
  };

  const statistics =
    pool.status === oracleDBTypes.POOL_STATUS_OPEN
      ? pool.getStatistics()
      : undefined;
  const metrics: PoolConnectionsCounter =
    pool.status === oracleDBTypes.POOL_STATUS_OPEN
      ? {
          used: pool.connectionsInUse,
          idle: pool.connectionsOpen - pool.connectionsInUse,
          pending: statistics?.currentQueueLength ?? 0,
          timeouts: statistics?.requestTimeouts ?? 0,
        }
      : { used: 0, idle: 0, pending: 0, timeouts: 0 };

  // all delta calculation at once
  const delta = {
    used: metrics.used - latest.used,
    idle: metrics.idle - latest.idle,
    pending: metrics.pending - latest.pending,
    timeouts: Math.max(metrics.timeouts - latest.timeouts, 0),
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

export function recordOperationDuration(
  metricsAttributes: Attributes,
  startExecTime: HrTime
) {
  const durationSeconds =
    hrTimeToMilliseconds(hrTimeDuration(startExecTime, hrTime())) / 1000;
  _operationDuration.record(durationSeconds, metricsAttributes);
}
