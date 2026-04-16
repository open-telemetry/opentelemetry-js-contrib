/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as KafkaJSTypes from 'kafkajs';

export const EVENT_LISTENERS_SET = Symbol(
  'opentelemetry.instrumentation.kafkajs.eventListenersSet'
);

export interface ConsumerExtended extends KafkaJSTypes.Consumer {
  [EVENT_LISTENERS_SET]?: boolean; // flag to identify if the event listeners for instrumentation have been set
}

export interface ProducerExtended extends KafkaJSTypes.Producer {
  [EVENT_LISTENERS_SET]?: boolean; // flag to identify if the event listeners for instrumentation have been set
}
