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

/*
 * This file contains semantic convention definitions used by this package.
 * Based on: https://github.com/open-telemetry/semantic-conventions/blob/main/model/messaging/spans.yaml
 *
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * The messaging system as identified by the client instrumentation.
 */
export const ATTR_MESSAGING_SYSTEM = 'messaging.system' as const;

/**
 * The system-specific name of the messaging operation.
 */
export const ATTR_MESSAGING_OPERATION_NAME =
  'messaging.operation.name' as const;

/**
 * A string identifying the type of the messaging operation.
 */
export const ATTR_MESSAGING_OPERATION_TYPE =
  'messaging.operation.type' as const;

/**
 * The message destination name (subject in NATS terminology).
 */
export const ATTR_MESSAGING_DESTINATION_NAME =
  'messaging.destination.name' as const;

/**
 * A boolean indicating if the destination is temporary.
 */
export const ATTR_MESSAGING_DESTINATION_TEMPORARY =
  'messaging.destination.temporary' as const;

/**
 * The name of the consumer group (queue group in NATS terminology).
 */
export const ATTR_MESSAGING_CONSUMER_GROUP_NAME =
  'messaging.consumer.group.name' as const;

/**
 * A unique identifier for the message.
 */
export const ATTR_MESSAGING_MESSAGE_ID = 'messaging.message.id' as const;

/**
 * A string identifying the messaging client instance.
 */
export const ATTR_MESSAGING_CLIENT_ID = 'messaging.client.id' as const;

/**
 * Server hostname or IP address.
 */
export const ATTR_SERVER_ADDRESS = 'server.address' as const;

/**
 * Server port number.
 */
export const ATTR_SERVER_PORT = 'server.port' as const;

/**
 * The conversation ID for request/reply patterns.
 */
export const ATTR_MESSAGING_MESSAGE_CONVERSATION_ID =
  'messaging.message.conversation_id' as const;

/**
 * The size of the message body in bytes.
 */
export const ATTR_MESSAGING_MESSAGE_BODY_SIZE =
  'messaging.message.body.size' as const;

/**
 * The size of the message envelope (headers + body) in bytes.
 */
export const ATTR_MESSAGING_MESSAGE_ENVELOPE_SIZE =
  'messaging.message.envelope.size' as const;

/**
 * Enum value "publish" for attribute {@link ATTR_MESSAGING_OPERATION_TYPE}.
 * One or more messages are provided for publishing to an intermediary.
 */
export const MESSAGING_OPERATION_TYPE_VALUE_PUBLISH = 'publish' as const;

/**
 * Enum value "receive" for attribute {@link ATTR_MESSAGING_OPERATION_TYPE}.
 * One or more messages are requested by a consumer.
 */
export const MESSAGING_OPERATION_TYPE_VALUE_RECEIVE = 'receive' as const;

/**
 * Enum value "process" for attribute {@link ATTR_MESSAGING_OPERATION_TYPE}.
 * One or more messages are processed by a consumer.
 */
export const MESSAGING_OPERATION_TYPE_VALUE_PROCESS = 'process' as const;

/**
 * Enum value "nats" for attribute {@link ATTR_MESSAGING_SYSTEM}.
 */
export const MESSAGING_SYSTEM_VALUE_NATS = 'nats' as const;

/**
 * Number of messages sent by the client (publish, request, respond).
 */
export const METRIC_MESSAGING_CLIENT_SENT_MESSAGES =
  'messaging.client.sent.messages' as const;

/**
 * Number of messages received by the client (subscribe).
 */
export const METRIC_MESSAGING_CLIENT_RECEIVED_MESSAGES =
  'messaging.client.received.messages' as const;
