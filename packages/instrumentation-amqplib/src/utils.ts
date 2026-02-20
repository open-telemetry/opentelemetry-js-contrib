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
import {
  Context,
  createContextKey,
  diag,
  HrTime,
  Span,
  Attributes,
} from '@opentelemetry/api';
import { SemconvStability } from '@opentelemetry/instrumentation';
import {
  ATTR_NETWORK_PROTOCOL_NAME,
  ATTR_NETWORK_PROTOCOL_VERSION,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_MESSAGING_OPERATION,
  ATTR_MESSAGING_SYSTEM,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
} from './semconv';
import {
  ATTR_MESSAGING_CONVERSATION_ID,
  ATTR_MESSAGING_DESTINATION,
  ATTR_MESSAGING_DESTINATION_KIND,
  ATTR_MESSAGING_PROTOCOL,
  ATTR_MESSAGING_PROTOCOL_VERSION,
  ATTR_MESSAGING_RABBITMQ_ROUTING_KEY,
  ATTR_MESSAGING_URL,
  MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
  MESSAGING_OPERATION_VALUE_PROCESS,
  OLD_ATTR_MESSAGING_MESSAGE_ID,
} from '../src/semconv-obsolete';
import type * as amqp from 'amqplib';
import {
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_MESSAGE_BODY_SIZE,
  ATTR_MESSAGING_MESSAGE_CONVERSATION_ID,
  ATTR_MESSAGING_MESSAGE_ID,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_OPERATION_TYPE,
  ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY,
  ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG,
  MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
  MESSAGING_OPERATION_TYPE_VALUE_SEND,
} from '@opentelemetry/semantic-conventions/incubating';

export const MESSAGE_STORED_SPAN: unique symbol = Symbol(
  'opentelemetry.amqplib.message.stored-span'
);
export const CHANNEL_SPANS_NOT_ENDED: unique symbol = Symbol(
  'opentelemetry.amqplib.channel.spans-not-ended'
);
export const CHANNEL_CONSUME_TIMEOUT_TIMER: unique symbol = Symbol(
  'opentelemetry.amqplib.channel.consumer-timeout-timer'
);
export const CONNECTION_ATTRIBUTES: unique symbol = Symbol(
  'opentelemetry.amqplib.connection.attributes'
);

export type InstrumentationConnection = amqp.Connection & {
  [CONNECTION_ATTRIBUTES]?: Attributes;
};
export type InstrumentationPublishChannel = (
  | amqp.Channel
  | amqp.ConfirmChannel
) & { connection: InstrumentationConnection };
export type InstrumentationConsumeChannel = amqp.Channel & {
  connection: InstrumentationConnection;
  [CHANNEL_SPANS_NOT_ENDED]?: {
    msg: amqp.ConsumeMessage;
    timeOfConsume: HrTime;
  }[];
  [CHANNEL_CONSUME_TIMEOUT_TIMER]?: NodeJS.Timeout;
};
export type InstrumentationMessage = amqp.Message & {
  [MESSAGE_STORED_SPAN]?: Span;
};
export type InstrumentationConsumeMessage = amqp.ConsumeMessage & {
  [MESSAGE_STORED_SPAN]?: Span;
};

const IS_CONFIRM_CHANNEL_CONTEXT_KEY: symbol = createContextKey(
  'opentelemetry.amqplib.channel.is-confirm-channel'
);

const censorPassword = (url: string): string => {
  return url.replace(/:[^:@/]*@/, ':***@');
};

const getPort = (
  portFromUrl: number | undefined,
  resolvedProtocol: string
): number => {
  // we are using the resolved protocol which is upper case
  // this code mimic the behavior of the amqplib which is used to set connection params
  return portFromUrl || (resolvedProtocol === 'AMQP' ? 5672 : 5671);
};

const getProtocol = (protocolFromUrl: string | undefined): string => {
  const resolvedProtocol = protocolFromUrl || 'amqp';
  // the substring removed the ':' part of the protocol ('amqp:' -> 'amqp')
  const noEndingColon = resolvedProtocol.endsWith(':')
    ? resolvedProtocol.substring(0, resolvedProtocol.length - 1)
    : resolvedProtocol;
  // upper cases to match spec
  return noEndingColon.toUpperCase();
};

const getHostname = (hostnameFromUrl: string | undefined): string => {
  // if user supplies empty hostname, it gets forwarded to 'net' package which default it to localhost.
  // https://nodejs.org/docs/latest-v12.x/api/net.html#net_socket_connect_options_connectlistener
  return hostnameFromUrl || 'localhost';
};

export const getConnectionAttributesFromServer = (
  conn: amqp.Connection
): Attributes => {
  const product = conn.serverProperties.product?.toLowerCase?.();
  if (product) {
    return {
      [ATTR_MESSAGING_SYSTEM]: product,
    };
  } else {
    return {};
  }
};

export const getConnectionAttributesFromUrl = (
  url: string | amqp.Options.Connect,
  netSemconvStability: SemconvStability,
  messagingSemconvStability: SemconvStability
): Attributes => {
  const attributes: Attributes = {};

  if (messagingSemconvStability & SemconvStability.OLD) {
    attributes[ATTR_MESSAGING_PROTOCOL_VERSION] = '0.9.1'; // this is the only protocol supported by the instrumented library
  }
  if (messagingSemconvStability & SemconvStability.STABLE) {
    attributes[ATTR_NETWORK_PROTOCOL_VERSION] = '0.9.1'; // this is the only protocol supported by the instrumented library
  }

  url = url || 'amqp://localhost';
  if (typeof url === 'object') {
    const protocol = getProtocol(url.protocol);
    const hostname = getHostname(url.hostname);
    const port = getPort(url.port, protocol);

    if (messagingSemconvStability & SemconvStability.OLD) {
      attributes[ATTR_MESSAGING_PROTOCOL] = protocol;
    }
    if (messagingSemconvStability & SemconvStability.STABLE) {
      attributes[ATTR_NETWORK_PROTOCOL_NAME] = protocol;
    }

    if (netSemconvStability & SemconvStability.OLD) {
      attributes[ATTR_NET_PEER_NAME] = hostname;
    }
    if (netSemconvStability & SemconvStability.STABLE) {
      attributes[ATTR_SERVER_ADDRESS] = hostname;
    }

    if (netSemconvStability & SemconvStability.OLD) {
      attributes[ATTR_NET_PEER_PORT] = port;
    }
    if (netSemconvStability & SemconvStability.STABLE) {
      attributes[ATTR_SERVER_PORT] = port;
    }
  } else {
    const censoredUrl = censorPassword(url);
    attributes[ATTR_MESSAGING_URL] = censoredUrl;
    try {
      const urlParts = new URL(censoredUrl);

      const protocol = getProtocol(urlParts.protocol);
      if (messagingSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_MESSAGING_PROTOCOL] = protocol;
      }
      if (messagingSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_NETWORK_PROTOCOL_NAME] = protocol;
      }

      const hostname = getHostname(urlParts.hostname);
      if (netSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_NET_PEER_NAME] = hostname;
      }
      if (netSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_SERVER_ADDRESS] = hostname;
      }

      const port = getPort(
        urlParts.port ? parseInt(urlParts.port) : undefined,
        protocol
      );
      if (netSemconvStability & SemconvStability.OLD) {
        attributes[ATTR_NET_PEER_PORT] = port;
      }
      if (netSemconvStability & SemconvStability.STABLE) {
        attributes[ATTR_SERVER_PORT] = port;
      }
    } catch (err) {
      diag.error(
        'amqplib instrumentation: error while extracting connection details from connection url',
        {
          censoredUrl,
          err,
        }
      );
    }
  }
  return attributes;
};

export const getPublishSpanName = (
  exchange: string,
  routingKey: string,
  messagingSemconvStability: SemconvStability
): string => {
  if (messagingSemconvStability & SemconvStability.STABLE) {
    return `publish ${getPublishDestinationName(exchange, routingKey)}`;
  }
  return `publish ${normalizeExchange(exchange)}`;
};

const normalizeExchange = (exchangeName: string) =>
  exchangeName !== '' ? exchangeName : '<default>';

export const getPublishAttributes = (
  exchange: string,
  routingKey: string,
  contentLength: number,
  options: amqp.Options.Publish = {},
  messagingSemconvStability: SemconvStability
): Attributes => {
  let attributes: Attributes = {};

  if (messagingSemconvStability & SemconvStability.OLD) {
    attributes = {
      [ATTR_MESSAGING_DESTINATION]: exchange,
      [ATTR_MESSAGING_DESTINATION_KIND]: MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
      [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: routingKey,
      [OLD_ATTR_MESSAGING_MESSAGE_ID]: options?.messageId,
      [ATTR_MESSAGING_CONVERSATION_ID]: options?.correlationId,
    };
  }
  if (messagingSemconvStability & SemconvStability.STABLE) {
    attributes = {
      ...attributes,
      [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_SEND,
      [ATTR_MESSAGING_OPERATION_NAME]: 'publish',
      [ATTR_MESSAGING_DESTINATION_NAME]: getPublishDestinationName(
        exchange,
        routingKey
      ),
      [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: routingKey,
      [ATTR_MESSAGING_MESSAGE_ID]: options?.messageId,
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: options?.correlationId,
      [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: contentLength,
    };
  }

  return attributes;
};

const getPublishDestinationName = (
  exchange: string,
  routingKey: string
): string => {
  if (exchange && routingKey) return `${exchange}:${routingKey}`;
  if (exchange) return exchange;
  if (routingKey) return routingKey;
  return 'amq.default';
};

export const getConsumeSpanName = (
  queue: string,
  msg: amqp.ConsumeMessage,
  messagingSemconvStability: SemconvStability
): string => {
  if (messagingSemconvStability & SemconvStability.STABLE) {
    return `consume ${getConsumeDestinationName(
      msg.fields?.exchange,
      msg.fields?.routingKey,
      queue
    )}`;
  }
  return `${queue} process`;
};

export const getConsumeAttributes = (
  queue: string,
  msg: amqp.ConsumeMessage,
  messagingSemconvStability: SemconvStability
): Attributes => {
  let attributes: Attributes = {};

  if (messagingSemconvStability & SemconvStability.OLD) {
    attributes = {
      [ATTR_MESSAGING_DESTINATION]: msg.fields?.exchange,
      [ATTR_MESSAGING_DESTINATION_KIND]: MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
      [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: msg.fields?.routingKey,
      [ATTR_MESSAGING_OPERATION]: MESSAGING_OPERATION_VALUE_PROCESS,
      [OLD_ATTR_MESSAGING_MESSAGE_ID]: msg.properties?.messageId,
      [ATTR_MESSAGING_CONVERSATION_ID]: msg.properties?.correlationId,
    };
  }
  if (messagingSemconvStability & SemconvStability.STABLE) {
    attributes = {
      ...attributes,
      [ATTR_MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
      [ATTR_MESSAGING_OPERATION_NAME]: 'consume',
      [ATTR_MESSAGING_DESTINATION_NAME]: getConsumeDestinationName(
        msg.fields?.exchange,
        msg.fields?.routingKey,
        queue
      ),
      [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: msg.fields?.routingKey,
      [ATTR_MESSAGING_RABBITMQ_MESSAGE_DELIVERY_TAG]: msg.fields?.deliveryTag,
      [ATTR_MESSAGING_MESSAGE_ID]: msg.properties?.messageId,
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: msg.properties?.correlationId,
      [ATTR_MESSAGING_MESSAGE_BODY_SIZE]: msg.content?.length,
    };
  }

  return attributes;
};

const getConsumeDestinationName = (
  exchange: string,
  routingKey: string,
  queue: string
): string => {
  const parts: string[] = [];
  if (exchange && !parts.includes(exchange)) parts.push(exchange);
  if (routingKey && !parts.includes(routingKey)) parts.push(routingKey);
  if (queue && !parts.includes(queue)) parts.push(queue);

  return parts.length ? parts.join(':') : 'amq.default';
};

export const markConfirmChannelTracing = (context: Context) => {
  return context.setValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY, true);
};

export const unmarkConfirmChannelTracing = (context: Context) => {
  return context.deleteValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY);
};

export const isConfirmChannelTracing = (context: Context) => {
  return context.getValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY) === true;
};
