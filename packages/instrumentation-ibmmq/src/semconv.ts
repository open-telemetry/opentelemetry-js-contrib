/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * This file contains a copy of unstable/experimental semantic convention
 * definitions used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 *
 * `messaging.ibmmq.queue_manager.id` is not (yet) part of
 * `@opentelemetry/semantic-conventions` - it tracks an unratified proposal
 * (semantic-conventions PR #4014) - so it is vendored here rather than
 * imported.
 */

export const ATTR_MESSAGING_SYSTEM = 'messaging.system' as const;
export const ATTR_MESSAGING_DESTINATION_NAME =
  'messaging.destination.name' as const;
export const ATTR_MESSAGING_OPERATION_NAME =
  'messaging.operation.name' as const;
export const ATTR_MESSAGING_OPERATION_TYPE =
  'messaging.operation.type' as const;

export const MESSAGING_OPERATION_TYPE_VALUE_SEND = 'send' as const;
export const MESSAGING_OPERATION_TYPE_VALUE_RECEIVE = 'receive' as const;
export const MESSAGING_OPERATION_TYPE_VALUE_PROCESS = 'process' as const;

/**
 * `messaging.system` is not yet pinned upstream for IBM MQ (see the Node.js
 * QMID session handoff, section 16). `'ibmmq'` is this package's own choice,
 * matching the `messaging.system` value kafkajs/amqplib set for their
 * respective systems.
 */
export const MESSAGING_SYSTEM_VALUE_IBMMQ = 'ibmmq' as const;

/**
 * The IBM MQ Queue Manager Identifier (QMID) - `MQCA_Q_MGR_IDENTIFIER`,
 * globally unique, format `<QMNAME>_YYYY-MM-DD_HH.MM.SS`. Not yet part of
 * `@opentelemetry/semantic-conventions` (semantic-conventions PR #4014,
 * closed/unratified). See `semantic-conventions/model/messaging/ibmmq.yaml`
 * and `registry.yaml` in the sibling `semantic-conventions` workstream repo.
 */
export const ATTR_MESSAGING_IBMMQ_QUEUE_MANAGER_ID =
  'messaging.ibmmq.queue_manager.id' as const;
