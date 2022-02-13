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
import { Span } from '@opentelemetry/api';
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type * as amqp from 'amqplib';

export interface PublishInfo {
  exchange: string;
  routingKey: string;
  content: Buffer;
  options?: amqp.Options.Publish;
  isConfirmChannel?: boolean;
}

export interface PublishConfirmedInfo extends PublishInfo {
    confirmError?: any;
}

export interface ConsumeInfo {
    msg: amqp.ConsumeMessage;
}

export interface ConsumeEndInfo {
    msg: amqp.ConsumeMessage;
    rejected: boolean | null;
    endOperation: EndOperation;
}

export interface AmqplibPublishCustomAttributeFunction {
  (span: Span, publishInfo: PublishInfo): void;
}

export interface AmqplibConfirmCustomAttributeFunction {
  (span: Span, publishConfirmedInto: PublishConfirmedInfo): void;
}

export interface AmqplibConsumerCustomAttributeFunction {
  (span: Span, consumeInfo: ConsumeInfo): void;
}

export interface AmqplibConsumerEndCustomAttributeFunction {
  (
    span: Span,
    consumeEndInfo: ConsumeEndInfo,
  ): void;
}

export enum EndOperation {
  AutoAck = 'auto ack',
  Ack = 'ack',
  AckAll = 'ackAll',
  Reject = 'reject',
  Nack = 'nack',
  NackAll = 'nackAll',
  ChannelClosed = 'channel closed',
  ChannelError = 'channel error',
  InstrumentationTimeout = 'instrumentation timeout',
}

export interface AmqplibInstrumentationConfig extends InstrumentationConfig {
  /** hook for adding custom attributes before publish message is sent */
  publishHook?: AmqplibPublishCustomAttributeFunction;

  /** hook for adding custom attributes after publish message is confirmed by the broker */
  publishConfirmHook?: AmqplibConfirmCustomAttributeFunction;

  /** hook for adding custom attributes before consumer message is processed */
  consumeHook?: AmqplibConsumerCustomAttributeFunction;

  /** hook for adding custom attributes after consumer message is acked to server */
  consumeEndHook?: AmqplibConsumerEndCustomAttributeFunction;

  /**
   * If passed, a span attribute will be added to all spans with key of the provided "moduleVersionAttributeName"
   * and value of the module version.
   */
  moduleVersionAttributeName?: string;

  /**
   * When user is setting up consume callback, it is user's responsibility to call
   * ack/nack etc on the msg to resolve it in the server.
   * If user is not calling the ack, the message will stay in the queue until
   * channel is closed, or until server timeout expires (if configured).
   * While we wait for the ack, a copy of the message is stored in plugin, which
   * will never be garbage collected.
   * To prevent memory leak, plugin has it's own configuration of timeout, which
   * will close the span if user did not call ack after this timeout.
   * If timeout is not big enough, span might be closed with 'InstrumentationTimeout',
   * and then received valid ack from the user later which will not be instrumented.
   *
   * Default is 1 minute
   */
  consumeTimeoutMs?: number;
}

export const DEFAULT_CONFIG: AmqplibInstrumentationConfig = {
  consumeTimeoutMs: 1000 * 60, // 1 minute
};
