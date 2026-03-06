# OpenTelemetry Amqplib (RabbitMQ) Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`amqplib`](https://www.npmjs.com/package/amqplib) (RabbitMQ) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-amqplib
```

## Supported Versions

- [`amqplib`](https://www.npmjs.com/package/amqplib) versions `>=0.5.5 <1`

## Usage

OpenTelemetry amqplib Instrumentation allows the user to automatically collect trace data and export them to the backend of choice, to give observability to distributed systems when working with [`amqplib`](https://github.com/amqp-node/amqplib) (RabbitMQ).

To load a specific plugin, specify it in the registerInstrumentations's configuration:

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { AmqplibInstrumentation } = require('@opentelemetry/instrumentation-amqplib');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new AmqplibInstrumentation({
      // publishHook: (span: Span, publishInfo: PublishInfo) => { },
      // publishConfirmHook: (span: Span, publishConfirmedInto: PublishConfirmedInfo) => { },
      // consumeHook: (span: Span, consumeInfo: ConsumeInfo) => { },
      // consumeEndHook: (span: Span, consumeEndInfo: ConsumeEndInfo) => { },
      // useLinksForConsume: boolean,
    }),
  ],
})
```

### amqplib Instrumentation Options

amqplib instrumentation has few options available to choose from. You can set the following:

| Options              | Type                                           | Description                                                                         |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `publishHook`        | `AmqplibPublishCustomAttributeFunction`        | hook for adding custom attributes before publish message is sent.                   |
| `publishConfirmHook` | `AmqplibPublishConfirmCustomAttributeFunction` | hook for adding custom attributes after publish message is confirmed by the broker. |
| `consumeHook`        | `AmqplibConsumeCustomAttributeFunction`        | hook for adding custom attributes before consumer message is processed.             |
| `consumeEndHook`     | `AmqplibConsumeEndCustomAttributeFunction`     | hook for adding custom attributes after consumer message is acked to server.        |
| `consumeTimeoutMs`   | `number`                                       | read [Consume Timeout](#consume-timeout) below                                      |
| `useLinksForConsume` | `boolean`                                      | read [Links for Consume](#links-for-consume) below                                  |

### Consume Timeout

When user is setting up consume callback, it is user's responsibility to call ack/nack etc on the msg to resolve it in the server. If user is not calling the ack, the message will stay in the queue until channel is closed, or until server timeout expires (if configured).

While we wait for the ack, a reference to the message is stored in plugin, which
will never be garbage collected.
To prevent memory leak, plugin has it's own configuration of timeout, which will close the span if user did not call ack after this timeout.

If timeout is not big enough, span might be closed with 'InstrumentationTimeout', and then received valid ack from the user later which will not be instrumented.

Default is 1 minute

### Links for Consume

By default, consume spans continue the trace where a message was produced. However, per the [spec](https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/#consumer-spans), consume spans should be linked to the message's creation context. Setting to true, this will enable the behavior to follow the spec.

Default is false

## Running Tests Locally

To run the tests locally, you need to have a RabbitMQ server running.  You can use the following command to start a RabbitMQ server using Docker:

```bash
npm run test:docker:run
```

By default, the tests that connect to RabbitMQ are skipped. To make sure these tests are run, you can set the `RUN_RABBIT_TESTS` environment variable to `true`

## Semantic Conventions

This package supports both legacy and future stable OpenTelemetry semantic conventions. The behavior is controlled by the `OTEL_SEMCONV_STABILITY_OPT_IN` environment variable.

### Networking Attributes (`http`)

Many networking-related semantic conventions (in semconv v1.21.0 and v1.23.1) were stabilized. As of `@opentelemetry/instrumentation-amqplib@0.56.0` support has been added for migrating to the stable semantic conventions using the `OTEL_SEMCONV_STABILITY_OPT_IN` environment variable as follows:

1. Upgrade to the latest version of this instrumentation package.
2. Set `OTEL_SEMCONV_STABILITY_OPT_IN=http/dup` to emit both old and stable semantic conventions. (The [`http` token is used to control the `net.*` attributes](https://github.com/open-telemetry/opentelemetry-js/issues/5663#issuecomment-3349204546).)
3. Modify alerts, dashboards, metrics, and other processes in your Observability system to use the stable semantic conventions.
4. Set `OTEL_SEMCONV_STABILITY_OPT_IN=http` to emit only the stable semantic conventions.

By default, if `OTEL_SEMCONV_STABILITY_OPT_IN` is not set or does not include `http`, then the old v1.7.0 semconv is used.
The intent is to provide an approximate 6 month time window for users of this instrumentation to migrate to the new networking semconv, after which a new minor version will use the new semconv by default and drop support for the old semconv.
See [the HTTP migration guide](https://opentelemetry.io/docs/specs/semconv/non-normative/http-migration/) and [deprecated network attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/network/#deprecated-network-attributes) for details.

| Old semconv     | Stable semconv   | Description        |
| --------------- | ---------------- | ------------------ |
| `net.peer.name` | `server.address` | Remote hostname    |
| `net.peer.port` | `server.port`    | Remote port number |

### Messaging Attributes (`messaging`)

**Note**: The v1.36.0+ conventions are not yet stable but will become stable in the future. This instrumentation is progressively implementing the new attributes and span names in preparation for the transition to stable conventions.

Configure the instrumentation using one of the following options:

- **Empty (default)**: Emit only legacy v1.7.0 conventions ([messaging spec](https://github.com/open-telemetry/opentelemetry-specification/blob/v1.7.0/semantic_conventions/README.md))
- **`messaging`**: Emit only stable v1.36.0+ conventions ([messaging spec](https://github.com/open-telemetry/semantic-conventions/blob/v1.36.0/docs/messaging/messaging-spans.md) or [RabbitMQ messaging spec](https://github.com/open-telemetry/semantic-conventions/blob/v1.36.0/docs/messaging/rabbitmq.md))
- **`messaging/dup`**: Emit both legacy and stable conventions simultaneously for migration purposes

#### Attributes Collected

| v1.7.0 semconv                    | v1.36.0+ semconv                             | Description |
| --------------------------------- | --------------------------------------------- | ----------- |
| `messaging.protocol`              | `network.protocol.name`                      | The name of the transport protocol (`AMQP`) |
| `messaging.protocol_version`      | `network.protocol.version`                   | The version of the transport protocol (`0.9.1`) |
| `messaging.system`                | `messaging.system`                            | A string identifying the messaging system (`rabbitmq`) |
| `messaging.url`                   | Removed                                       | The connection string (with credentials masked) |
| `messaging.destination_kind`      | Removed                                       | The kind of message destination (always `topic` for RabbitMQ) |
| -                                 | `messaging.operation.type`                   | A string identifying the type of operation (`send`, `receive`) |
| `messaging.operation`             | `messaging.operation.name`                   | A string identifying the name of operation (`publish`, `consume`) |
| `messaging.destination`           | `messaging.destination.name`                 | The message destination name (exchange name or destination) |
| `messaging.message_id`            | `messaging.message.id`                       | A value used by the messaging system as an identifier for the message |
| `messaging.conversation_id`       | `messaging.message.conversation_id`          | The ID identifying the conversation to which the message belongs |
| -                                 | `messaging.message.body.size`                | The size of the message body in bytes |
| `messaging.rabbitmq.routing_key`  | `messaging.rabbitmq.destination.routing_key` | RabbitMQ message routing key |
| -                                 | `messaging.rabbitmq.message.delivery_tag`    | RabbitMQ message delivery tag (consume operations only) |

#### Span Naming Conventions

The instrumentation generates different span names based on the semantic convention version:

##### Publish Operations

- **Legacy**: `publish {exchange}` (or `publish <default>` for default exchange)
- **Stable**: `publish {destination}` where destination follows the pattern:
  - `{exchange}:{routing_key}` when both are present
  - `{exchange}` when only exchange is present
  - `{routing_key}` when only routing key is present
  - `amq.default` when neither is present

##### Consume Operations

- **Legacy**: `{queue} process`
- **Stable**: `consume {destination}` where destination follows this priority pattern:
  - `{exchange}:{routing_key}:{queue}` when all are present and routing_key ≠ queue
  - `{exchange}:{routing_key}` when all are present and routing_key = queue, or when exchange and routing_key are present
  - `{exchange}:{queue}` when exchange and queue are present (no routing_key)
  - `{routing_key}:{queue}` when routing_key and queue are present (no exchange)
  - `{exchange}` when only exchange is present
  - `{routing_key}` when only routing_key is present
  - `{queue}` when only queue is present
  - `amq.default` when none are present

#### Migration Guide

When upgrading to the new semantic conventions, it is recommended to follow this migration path:

1. **Upgrade** `@opentelemetry/instrumentation-amqplib` to the latest version
2. **Enable dual mode**: Set `OTEL_SEMCONV_STABILITY_OPT_IN=messaging/dup` to emit both old and new semantic conventions
3. **Update monitoring**: Modify alerts, dashboards, metrics, and other processes to use the new semantic conventions
4. **Switch to stable**: Set `OTEL_SEMCONV_STABILITY_OPT_IN=messaging` to emit only the new semantic conventions

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-amqplib
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-amqplib.svg
