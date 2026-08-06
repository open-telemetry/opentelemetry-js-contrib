/*
 * Copyright The OpenTelemetry Authors
 * Copyright (c) 2026, Oracle and/or its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Attributes,
  type Counter,
  type Histogram,
  type HrTime,
  type Meter,
  type UpDownCounter,
  ValueType,
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

let operationDuration!: Histogram;
let connectionsCount!: UpDownCounter;
let connectionPendingRequests!: UpDownCounter;
let connectionsTimeouts!: Counter;

// Pool properties provide absolute values, but synchronous counters can only be
// updated by adding deltas. Store the last recorded values for each pool to
// calculate the correct delta on every pool event. On the next pool event, this
// also reconciles any pool changes that were not recorded, such as changes made
// while instrumentation was disabled, ensuring metric values remain accurate.
// WeakMap keyed by Pool instance prevents memory leaks when pools are
// dropped without an explicit close and state collisions between pools that
// share aliases or connect strings.
let connectionsCounterState = new WeakMap<
  oracleDBTypes.Pool,
  PoolConnectionsCounter
>();

export interface PoolConnectionsCounter {
  idle: number;
  pending: number;
  used: number;
  timeouts: number;
}

const EMPTY_COUNTER_STATE: PoolConnectionsCounter = {
  idle: 0,
  pending: 0,
  used: 0,
  timeouts: 0,
};

function createEmptyCounterState(): PoolConnectionsCounter {
  return { ...EMPTY_COUNTER_STATE };
}

function getCurrentPoolState(pool: oracleDBTypes.Pool): PoolConnectionsCounter {
  if (pool.status !== oracleDBTypes.POOL_STATUS_OPEN) {
    return createEmptyCounterState();
  }

  const statistics = pool.getStatistics?.();

  return {
    used: pool.connectionsInUse,
    idle: pool.connectionsOpen - pool.connectionsInUse,
    pending: statistics?.currentQueueLength ?? 0,
    timeouts: statistics?.requestTimeouts ?? 0,
  };
}

// Returns the pool name used in connection pool metric attributes.
export function getPoolName(
  pool: oracleDBTypes.Pool & { connectString?: string }
): string {
  return pool.poolAlias?.trim() || pool.connectString?.trim() || 'default';
}

export function setMetricInstruments(meter: Meter) {
  connectionsCounterState = new WeakMap();

  connectionsCount = meter.createUpDownCounter(
    METRIC_DB_CLIENT_CONNECTION_COUNT,
    {
      description:
        'The number of connections that are currently in state described by the state attribute.',
      unit: '{connection}',
    }
  );

  connectionPendingRequests = meter.createUpDownCounter(
    METRIC_DB_CLIENT_CONNECTION_PENDING_REQUESTS,
    {
      description:
        'The number of current pending requests for an open connection.',
      unit: '{request}',
    }
  );

  connectionsTimeouts = meter.createCounter(
    METRIC_DB_CLIENT_CONNECTION_TIMEOUTS,
    {
      description:
        'The number of connection timeouts that have occurred trying to obtain a connection from the pool.',
      unit: '{timeout}',
    }
  );

  operationDuration = meter.createHistogram(
    METRIC_DB_CLIENT_OPERATION_DURATION,
    {
      description: 'Duration of database client operations.',
      unit: 's',
      valueType: ValueType.DOUBLE,
      advice: {
        explicitBucketBoundaries: [
          0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10,
        ],
      },
    }
  );
}

export function updateCounter(pool: oracleDBTypes.Pool) {
  if (!pool) return;

  const prev = connectionsCounterState.get(pool) ?? createEmptyCounterState();
  const curr = getCurrentPoolState(pool);
  const poolName = getPoolName(pool);

  const deltaUsed = curr.used - prev.used;
  const deltaIdle = curr.idle - prev.idle;
  const deltaPending = curr.pending - prev.pending;
  const deltaTimeouts = Math.max(curr.timeouts - prev.timeouts, 0);

  const poolAttr = { [ATTR_DB_CLIENT_CONNECTION_POOL_NAME]: poolName };

  connectionsCount.add(deltaUsed, {
    ...poolAttr,
    [ATTR_DB_CLIENT_CONNECTION_STATE]: DB_CLIENT_CONNECTION_STATE_VALUE_USED,
  });

  connectionsCount.add(deltaIdle, {
    ...poolAttr,
    [ATTR_DB_CLIENT_CONNECTION_STATE]: DB_CLIENT_CONNECTION_STATE_VALUE_IDLE,
  });

  connectionPendingRequests.add(deltaPending, poolAttr);
  connectionsTimeouts.add(deltaTimeouts, poolAttr);

  if (pool.status === oracleDBTypes.POOL_STATUS_OPEN) {
    connectionsCounterState.set(pool, curr);
  } else {
    connectionsCounterState.delete(pool);
  }
}

export function recordOperationDuration(
  metricsAttributes: Attributes,
  startExecTime: HrTime
) {
  const durationSeconds =
    hrTimeToMilliseconds(hrTimeDuration(startExecTime, hrTime())) / 1000;
  operationDuration.record(durationSeconds, metricsAttributes);
}
