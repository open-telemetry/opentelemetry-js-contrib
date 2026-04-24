/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */

/**
 * The URL of the AWS SQS Queue. It's a unique identifier for a queue in Amazon Simple Queue Service (SQS) and is used to access the queue and perform actions on it.
 *
 * @example https://sqs.us-east-1.amazonaws.com/123456789012/MyQueue
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_AWS_SQS_QUEUE_URL = 'aws.sqs.queue.url' as const;

/**
 * The cloud account ID the resource is assigned to.
 *
 * @example 111111111111
 * @example opentelemetry
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_CLOUD_ACCOUNT_ID = 'cloud.account.id' as const;

/**
 * A boolean that is true if the serverless function is executed for the first time (aka cold-start).
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_FAAS_COLDSTART = 'faas.coldstart' as const;

/**
 * The name of the single function that this runtime instance executes.
 *
 * @example my-function
 * @example myazurefunctionapp/some-function-name
 *
 * @note This is the name of the function as configured/deployed on the FaaS
 * platform and is usually different from the name of the callback
 * function (which may be stored in the
 * [`code.namespace`/`code.function.name`](/docs/general/attributes.md#source-code-attributes)
 * span attributes).
 *
 * For some cloud providers, the above definition is ambiguous. The following
 * definition of function name **MUST** be used for this attribute
 * (and consequently the span name) for the listed cloud providers/products:
 *
 *   - **Azure:**  The full name `<FUNCAPP>/<FUNC>`, i.e., function app name
 *     followed by a forward slash followed by the function name (this form
 *     can also be seen in the resource JSON for the function).
 *     This means that a span attribute **MUST** be used, as an Azure function
 *     app can host multiple functions that would usually share
 *     a TracerProvider (see also the `cloud.resource_id` attribute).
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_FAAS_NAME = 'faas.name' as const;

/**
 * Type of the trigger which caused this function invocation.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_FAAS_TRIGGER = 'faas.trigger' as const;

/**
 * The number of messages sent, received, or processed in the scope of the batching operation.
 *
 * @example 0
 * @example 1
 * @example 2
 *
 * @note Instrumentations **SHOULD NOT** set `messaging.batch.message_count` on spans that operate with a single message. When a messaging client library supports both batch and single-message API for the same operation, instrumentations **SHOULD** use `messaging.batch.message_count` for batching APIs and **SHOULD NOT** use it for single-message APIs.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_BATCH_MESSAGE_COUNT = 'messaging.batch.message_count' as const;

/**
 * The message destination name
 *
 * @example MyQueue
 * @example MyTopic
 *
 * @note Destination name **SHOULD** uniquely identify a specific queue, topic or other entity within the broker. If
 * the broker doesn't have such notion, the destination name **SHOULD** uniquely identify the broker.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_DESTINATION_NAME = 'messaging.destination.name' as const;

/**
 * A value used by the messaging system as an identifier for the message, represented as a string.
 *
 * @example "452a7c7c7c7048c2f887f61572b18fc2"
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_MESSAGE_ID = 'messaging.message.id' as const;

/**
 * The system-specific name of the messaging operation.
 *
 * @example ack
 * @example nack
 * @example send
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_OPERATION_NAME = 'messaging.operation.name' as const;

/**
 * A string identifying the type of the messaging operation.
 *
 * @note If a custom value is used, it **MUST** be of low cardinality.
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_OPERATION_TYPE = 'messaging.operation.type' as const;

/**
 * The messaging system as identified by the client instrumentation.
 *
 * @note The actual messaging system may differ from the one known by the client. For example, when using Kafka client libraries to communicate with Azure Event Hubs, the `messaging.system` is set to `kafka` based on the instrumentation's best knowledge.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const ATTR_MESSAGING_SYSTEM = 'messaging.system' as const;

/**
 * Enum value "pubsub" for attribute {@link ATTR_FAAS_TRIGGER}.
 *
 * A function is set to be executed when messages are sent to a messaging system
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const FAAS_TRIGGER_VALUE_PUBSUB = 'pubsub' as const;

/**
 * Enum value "process" for attribute {@link ATTR_MESSAGING_OPERATION_TYPE}.
 *
 * One or more messages are processed by a consumer.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const MESSAGING_OPERATION_TYPE_VALUE_PROCESS = 'process' as const;

/**
 * Enum value "aws_sqs" for attribute {@link ATTR_MESSAGING_SYSTEM}.
 *
 * Amazon Simple Queue Service (SQS)
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
export const MESSAGING_SYSTEM_VALUE_AWS_SQS = 'aws_sqs' as const;
