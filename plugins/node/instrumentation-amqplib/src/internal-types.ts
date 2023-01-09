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

interface ServerProperties {
  host: string;
  product: string;
  version: string;
  platform: string;
  copyright?: string;
  information: string;
  [key: string]: string | undefined;
}

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

export interface Connection {
  close(): Promise<void>;
  createChannel(): Promise<any>;
  createConfirmChannel(): Promise<ConfirmChannel>;
  connection: {
    serverProperties: ServerProperties;
  };
}

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
