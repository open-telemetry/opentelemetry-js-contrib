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
  ATTR_NETWORK_PEER_ADDRESS,
  ATTR_NETWORK_PEER_PORT,
  ATTR_NETWORK_PROTOCOL_NAME,
  ATTR_NETWORK_PROTOCOL_VERSION,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  MESSAGINGDESTINATIONKINDVALUES_TOPIC,
  SEMATTRS_MESSAGING_CONVERSATION_ID,
  SEMATTRS_MESSAGING_DESTINATION,
  SEMATTRS_MESSAGING_DESTINATION_KIND,
  SEMATTRS_MESSAGING_MESSAGE_ID,
  SEMATTRS_MESSAGING_PROTOCOL,
  SEMATTRS_MESSAGING_PROTOCOL_VERSION,
  SEMATTRS_MESSAGING_RABBITMQ_ROUTING_KEY,
  SEMATTRS_MESSAGING_URL,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_MESSAGING_DESTINATION_NAME,
  ATTR_MESSAGING_MESSAGE_BODY_SIZE,
  ATTR_MESSAGING_MESSAGE_CONVERSATION_ID,
  ATTR_MESSAGING_MESSAGE_ID,
  ATTR_MESSAGING_OPERATION_NAME,
  ATTR_MESSAGING_OPERATION_TYPE,
  ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY,
  ATTR_MESSAGING_SYSTEM,
  MESSAGING_OPERATION_TYPE_VALUE_SEND,
} from '@opentelemetry/semantic-conventions/incubating';
import type * as amqp from 'amqplib';

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

export type InstrumentationPublishChannel = (
  | amqp.Channel
  | amqp.ConfirmChannel
) & { connection: { [CONNECTION_ATTRIBUTES]: Attributes } };
export type InstrumentationConsumeChannel = amqp.Channel & {
  connection: { [CONNECTION_ATTRIBUTES]: Attributes };
  [CHANNEL_SPANS_NOT_ENDED]?: {
    msg: amqp.ConsumeMessage;
    timeOfConsume: HrTime;
  }[];
  [CHANNEL_CONSUME_TIMEOUT_TIMER]?: NodeJS.Timeout;
};
export type InstrumentationMessage = amqp.Message & {
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
  conn: amqp.Connection['connection']
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
  semconvStability: SemconvStability
): Attributes => {
  const oldAttributes: Attributes = {
    [SEMATTRS_MESSAGING_PROTOCOL_VERSION]: '0.9.1', // this is the only protocol supported by the instrumented library
  };
  const stableAttributes: Attributes = {
    [ATTR_NETWORK_PROTOCOL_VERSION]: '0.9.1', // this is the only protocol supported by the instrumented library
  };

  url = url || 'amqp://localhost';
  if (typeof url === 'object') {
    const protocol = getProtocol(url.protocol);
    const hostname = getHostname(url.hostname);
    const port = getPort(url.port, protocol);

    oldAttributes[SEMATTRS_MESSAGING_PROTOCOL] = protocol;
    oldAttributes[SEMATTRS_NET_PEER_NAME] = hostname;
    oldAttributes[SEMATTRS_NET_PEER_PORT] = port;

    stableAttributes[ATTR_NETWORK_PROTOCOL_NAME] = protocol;
    stableAttributes[ATTR_NETWORK_PEER_ADDRESS] = hostname;
    stableAttributes[ATTR_NETWORK_PEER_PORT] = port;
    stableAttributes[ATTR_SERVER_ADDRESS] = hostname;
    stableAttributes[ATTR_SERVER_PORT] = port;
  } else {
    const censoredUrl = censorPassword(url);
    oldAttributes[SEMATTRS_MESSAGING_URL] = censoredUrl;

    try {
      const urlParts = new URL(censoredUrl);
      const protocol = getProtocol(urlParts.protocol);
      const hostname = getHostname(urlParts.hostname);
      const port = getPort(
        urlParts.port ? parseInt(urlParts.port) : undefined,
        protocol
      );

      oldAttributes[SEMATTRS_MESSAGING_PROTOCOL] = protocol;
      oldAttributes[SEMATTRS_NET_PEER_NAME] = hostname;
      oldAttributes[SEMATTRS_NET_PEER_PORT] = port;

      stableAttributes[ATTR_NETWORK_PROTOCOL_NAME] = protocol;
      stableAttributes[ATTR_NETWORK_PEER_ADDRESS] = hostname;
      stableAttributes[ATTR_NETWORK_PEER_PORT] = port;
      stableAttributes[ATTR_SERVER_ADDRESS] = hostname;
      stableAttributes[ATTR_SERVER_PORT] = port;
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

  let attributes: Attributes = {};
  if (semconvStability & SemconvStability.OLD) {
    attributes = oldAttributes;
  }
  if (semconvStability & SemconvStability.STABLE) {
    attributes = { ...attributes, ...stableAttributes };
  }
  return attributes;
};

export const getPublishSpanName = (
  exchange: string,
  routingKey: string,
  semconvStability: SemconvStability
): string => {
  if (semconvStability & SemconvStability.STABLE) {
    return `publish ${getPublishDestinationName(exchange, routingKey)}`;
  }
  return `publish ${normalizeExchange(exchange)}`;
};

export const getPublishAttributes = (
  exchange: string,
  routingKey: string,
  contentLength: number,
  options: amqp.Options.Publish = {},
  semconvStability: SemconvStability
): Attributes => {
  const oldAttributes: Attributes = {
    [SEMATTRS_MESSAGING_DESTINATION]: exchange,
    [SEMATTRS_MESSAGING_DESTINATION_KIND]: MESSAGINGDESTINATIONKINDVALUES_TOPIC,
    [SEMATTRS_MESSAGING_RABBITMQ_ROUTING_KEY]: routingKey,
    [SEMATTRS_MESSAGING_MESSAGE_ID]: options?.messageId,
    [SEMATTRS_MESSAGING_CONVERSATION_ID]: options?.correlationId,
  };
  const stableAttributes: Attributes = {
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

  let attributes: Attributes = {};
  if (semconvStability & SemconvStability.OLD) {
    attributes = oldAttributes;
  }
  if (semconvStability & SemconvStability.STABLE) {
    attributes = { ...attributes, ...stableAttributes };
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

const normalizeExchange = (exchangeName: string) =>
  exchangeName !== '' ? exchangeName : '<default>';

export const markConfirmChannelTracing = (context: Context) => {
  return context.setValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY, true);
};

export const unmarkConfirmChannelTracing = (context: Context) => {
  return context.deleteValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY);
};

export const isConfirmChannelTracing = (context: Context) => {
  return context.getValue(IS_CONFIRM_CHANNEL_CONTEXT_KEY) === true;
};
