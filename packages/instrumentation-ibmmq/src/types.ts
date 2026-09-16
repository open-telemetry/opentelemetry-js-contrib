/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstrumentationConfig } from '@opentelemetry/instrumentation';

export interface IbmMqInstrumentationConfig extends InstrumentationConfig {
  /**
   * Stamp the IBM MQ Queue Manager Identifier (QMID,
   * `messaging.ibmmq.queue_manager.id`) onto every send/receive/process
   * span. Gated because the attribute is unratified upstream and costs one
   * MQINQ network round trip per connection (never per message).
   *
   * Defaults from `process.env.OTEL_INSTRUMENTATION_IBMMQ_EMIT_QUEUE_MANAGER_ID
   * === 'true'`. The env fallback is load-bearing, not belt-and-braces:
   * `auto-instrumentations-node/register` exposes no per-instrumentation
   * config hook, so a config-only gate would be unsettable without editing
   * application code.
   */
  emitQueueManagerId?: boolean;
}

export const DEFAULT_CONFIG: IbmMqInstrumentationConfig = {
  emitQueueManagerId:
    process.env.OTEL_INSTRUMENTATION_IBMMQ_EMIT_QUEUE_MANAGER_ID === 'true',
};
