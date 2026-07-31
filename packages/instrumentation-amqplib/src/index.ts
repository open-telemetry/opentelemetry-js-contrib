/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */
export { AmqplibInstrumentation } from './amqplib';
export { DEFAULT_CONFIG, EndOperation } from './types';
export type {
  AmqplibConsumeCustomAttributeFunction,
  AmqplibConsumeEndCustomAttributeFunction,
  AmqplibInstrumentationConfig,
  AmqplibPublishConfirmCustomAttributeFunction,
  AmqplibPublishCustomAttributeFunction,
  AmqplibPublishOptions,
  CommonMessageFields,
  ConsumeEndInfo,
  ConsumeInfo,
  ConsumeMessage,
  ConsumeMessageFields,
  Message,
  MessageFields,
  MessageProperties,
  PublishConfirmedInfo,
  PublishInfo,
} from './types';
