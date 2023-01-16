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

export interface PublishInfo {
  moduleVersion: string | undefined;
  exchange: string;
  routingKey: string;
  content: Buffer;
  options?: Options.Publish;
  isConfirmChannel?: boolean;
}

export interface PublishConfirmedInfo extends PublishInfo {
  confirmError?: any;
}

export interface ConsumeInfo {
  moduleVersion: string | undefined;
  msg: ConsumeMessage;
}

export interface ConsumeEndInfo {
  msg: ConsumeMessage;
  rejected: boolean | null;
  endOperation: EndOperation;
}

export interface AmqplibPublishCustomAttributeFunction {
  (span: Span, publishInfo: PublishInfo): void;
}

export interface AmqplibPublishConfirmCustomAttributeFunction {
  (span: Span, publishConfirmedInto: PublishConfirmedInfo): void;
}

export interface AmqplibConsumeCustomAttributeFunction {
  (span: Span, consumeInfo: ConsumeInfo): void;
}

export interface AmqplibConsumeEndCustomAttributeFunction {
  (span: Span, consumeEndInfo: ConsumeEndInfo): void;
}

export enum EndOperation {
  AutoAck = "auto ack",
  Ack = "ack",
  AckAll = "ackAll",
  Reject = "reject",
  Nack = "nack",
  NackAll = "nackAll",
  ChannelClosed = "channel closed",
  ChannelError = "channel error",
  InstrumentationTimeout = "instrumentation timeout",
}

export interface AmqplibInstrumentationConfig extends InstrumentationConfig {
  /** hook for adding custom attributes before publish message is sent */
  publishHook?: AmqplibPublishCustomAttributeFunction;

  /** hook for adding custom attributes after publish message is confirmed by the broker */
  publishConfirmHook?: AmqplibPublishConfirmCustomAttributeFunction;

  /** hook for adding custom attributes before consumer message is processed */
  consumeHook?: AmqplibConsumeCustomAttributeFunction;

  /** hook for adding custom attributes after consumer message is acked to server */
  consumeEndHook?: AmqplibConsumeEndCustomAttributeFunction;

  /**
   * When user is setting up consume callback, it is user's responsibility to call
   * ack/nack etc on the msg to resolve it in the server.
   * If user is not calling the ack, the message will stay in the queue until
   * channel is closed, or until server timeout expires (if configured).
   * While we wait for the ack, a reference to the message is stored in plugin, which
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

// The following types are vendored from `@types/amqplib@0.10.1` - commit SHA: 4205e03127692a40b4871709a7134fe4e2ed5510

// Vendored from: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/4205e03127692a40b4871709a7134fe4e2ed5510/types/amqplib/properties.d.ts#LL23C18-L23C25
export namespace Options {
  export interface Connect {
    /**
     * The to be used protocol
     *
     * Default value: 'amqp'
     */
    protocol?: string;
    /**
     * Hostname used for connecting to the server.
     *
     * Default value: 'localhost'
     */
    hostname?: string;
    /**
     * Port used for connecting to the server.
     *
     * Default value: 5672
     */
    port?: number;
    /**
     * Username used for authenticating against the server.
     *
     * Default value: 'guest'
     */
    username?: string;
    /**
     * Password used for authenticating against the server.
     *
     * Default value: 'guest'
     */
    password?: string;
    /**
     * The desired locale for error messages. RabbitMQ only ever uses en_US
     *
     * Default value: 'en_US'
     */
    locale?: string;
    /**
     * The size in bytes of the maximum frame allowed over the connection. 0 means
     * no limit (but since frames have a size field which is an unsigned 32 bit integer, it’s perforce 2^32 - 1).
     *
     * Default value: 0x1000 (4kb) - That's the allowed minimum, it will fit many purposes
     */
    frameMax?: number;
    /**
     * The period of the connection heartbeat in seconds.
     *
     * Default value: 0
     */
    heartbeat?: number;
    /**
     * What VHost shall be used.
     *
     * Default value: '/'
     */
    vhost?: string;
  }

  export interface AssertQueue {
    exclusive?: boolean;
    durable?: boolean;
    autoDelete?: boolean;
    arguments?: any;
    messageTtl?: number;
    expires?: number;
    deadLetterExchange?: string;
    deadLetterRoutingKey?: string;
    maxLength?: number;
    maxPriority?: number;
  }
  export interface DeleteQueue {
    ifUnused?: boolean;
    ifEmpty?: boolean;
  }
  export interface AssertExchange {
    durable?: boolean;
    internal?: boolean;
    autoDelete?: boolean;
    alternateExchange?: string;
    arguments?: any;
  }
  export interface DeleteExchange {
    ifUnused?: boolean;
  }
  export interface Publish {
    expiration?: string | number;
    userId?: string;
    CC?: string | string[];

    mandatory?: boolean;
    persistent?: boolean;
    deliveryMode?: boolean | number;
    BCC?: string | string[];

    contentType?: string;
    contentEncoding?: string;
    headers?: any;
    priority?: number;
    correlationId?: string;
    replyTo?: string;
    messageId?: string;
    timestamp?: number;
    type?: string;
    appId?: string;
  }

  export interface Consume {
    consumerTag?: string;
    noLocal?: boolean;
    noAck?: boolean;
    exclusive?: boolean;
    priority?: number;
    arguments?: any;
  }

  export interface Get {
    noAck?: boolean;
  }
}

// Vendored from: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/4205e03127692a40b4871709a7134fe4e2ed5510/types/amqplib/properties.d.ts#L214
interface ServerProperties {
  host: string;
  product: string;
  version: string;
  platform: string;
  copyright?: string;
  information: string;
  [key: string]: string | undefined;
}

// Vendored from: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/4205e03127692a40b4871709a7134fe4e2ed5510/types/amqplib/properties.d.ts#L1
export namespace Replies {
  export interface Empty {}
  export interface AssertQueue {
    queue: string;
    messageCount: number;
    consumerCount: number;
  }
  export interface PurgeQueue {
    messageCount: number;
  }
  export interface DeleteQueue {
    messageCount: number;
  }
  export interface AssertExchange {
    exchange: string;
  }
  export interface Consume {
    consumerTag: string;
  }
}

// Vendored from: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/4205e03127692a40b4871709a7134fe4e2ed5510/types/amqplib/callback_api.d.ts#L55
export interface ConfirmChannel {
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: Options.Publish,
    callback?: (err: any, ok: Replies.Empty) => void
  ): boolean;
  sendToQueue(
    queue: string,
    content: Buffer,
    options?: Options.Publish,
    callback?: (err: any, ok: Replies.Empty) => void
  ): boolean;

  waitForConfirms(): Promise<void>;
}

// Vendored from: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/4205e03127692a40b4871709a7134fe4e2ed5510/types/amqplib/callback_api.d.ts#L5
export interface Connection {
  close(): Promise<void>;
  createChannel(): Promise<any>;
  createConfirmChannel(): Promise<ConfirmChannel>;
  connection: {
    serverProperties: ServerProperties;
  };
}

// Vendored from: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/4205e03127692a40b4871709a7134fe4e2ed5510/types/amqplib/properties.d.ts#L142
export interface Message {
  content: Buffer;
  fields: MessageFields;
  properties: MessageProperties;
}

export interface GetMessage extends Message {
  fields: GetMessageFields;
}

export interface ConsumeMessage extends Message {
  fields: ConsumeMessageFields;
}

export interface CommonMessageFields {
  deliveryTag: number;
  redelivered: boolean;
  exchange: string;
  routingKey: string;
}

export interface MessageFields extends CommonMessageFields {
  messageCount?: number;
  consumerTag?: string;
}

export interface GetMessageFields extends CommonMessageFields {
  messageCount: number;
}

export interface ConsumeMessageFields extends CommonMessageFields {
  deliveryTag: number;
}

export interface MessageProperties {
  contentType: any | undefined;
  contentEncoding: any | undefined;
  headers: any;
  deliveryMode: any | undefined;
  priority: any | undefined;
  correlationId: any | undefined;
  replyTo: any | undefined;
  expiration: any | undefined;
  messageId: any | undefined;
  timestamp: any | undefined;
  type: any | undefined;
  userId: any | undefined;
  appId: any | undefined;
  clusterId: any | undefined;
}
