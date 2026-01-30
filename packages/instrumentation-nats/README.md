# OpenTelemetry NATS Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`nats`](https://www.npmjs.com/package/nats) package, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-nats
```

## Supported Versions

- [`nats`](https://www.npmjs.com/package/nats) versions `>=2 <3`

## Usage

OpenTelemetry NATS Instrumentation allows the user to automatically collect trace data and export them to the backend of choice, to give observability to distributed systems when working with the [`nats`](https://github.com/nats-io/nats.js) client library.

To load the instrumentation, specify it in the registerInstrumentations's configuration:

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { NatsInstrumentation } = require('@opentelemetry/instrumentation-nats');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new NatsInstrumentation({
      // publishHook: (span, publishInfo) => { },
      // consumeHook: (span, consumeInfo) => { },
      // includeMessageBodySize: false,
    }),
  ],
});
```

### Instrumentation Options

You can set the following:

| Options                  | Type          | Description                                                                              |
| ------------------------ | ------------- | ---------------------------------------------------------------------------------------- |
| `publishHook`            | `PublishHook` | Hook for adding custom attributes before a message is published (publish, request).      |
| `consumeHook`            | `ConsumeHook` | Hook for adding custom attributes before a received message is processed.                |
| `includeMessageBodySize` | `boolean`     | Whether to include message body size in span attributes. Defaults to `false`.            |

## Performance Considerations

When using this instrumentation, be aware of potential performance implications. The instrumentation wraps the NATS client methods and performs callouts to the tracing system. Depending on your tracing backend configuration, this could:

- Add latency to publish and subscribe operations
- Create hard-to-diagnose issues such as slow consumers if the tracing backend is slow or unavailable
- Cause memory growth if spans are not exported promptly

For high-throughput NATS applications, consider:

- Using asynchronous span exporters
- Implementing sampling strategies to reduce tracing overhead
- Monitoring your application's performance with and without instrumentation enabled

## Semantic Conventions

This package uses `@opentelemetry/semantic-conventions` version `1.30+`, which implements Semantic Convention [Version 1.30.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.30.0/docs/README.md)

### Spans Emitted

| NATS Operation | Span Kind | Span Name            | Operation Type | Operation Name |
| -------------- | --------- | -------------------- | -------------- | -------------- |
| `publish`      | Producer  | `send <subject>`     | `publish`      | `publish`      |
| `request`      | Producer  | `send <subject>`     | `publish`      | `request`      |
| `respond`      | Producer  | `send <reply-inbox>` | `publish`      | `respond`      |
| `subscribe`    | Consumer  | `process <subject>`  | `process`      | `process`      |

### Metrics Emitted

| NATS Operation            | Metric Name                          | Short Description                                           |
| ------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| publish, request, respond | `messaging.client.sent.messages`     | Number of messages sent by the client.                      |
| subscribe                 | `messaging.client.received.messages` | Number of messages received and processed by the client.    |

### Attributes Collected

These attributes are added to spans and metrics where applicable.

| Attribute                            | Short Description                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `messaging.system`                   | An identifier for the messaging system being used (i.e. `"nats"`).                |
| `messaging.destination.name`         | The message destination name (subject in NATS terminology).                       |
| `messaging.destination.temporary`    | A boolean indicating if the destination is temporary (true for reply inboxes).    |
| `messaging.operation.type`           | A string identifying the type of messaging operation (`publish` or `process`).    |
| `messaging.operation.name`           | The system-specific name of the messaging operation.                              |
| `messaging.consumer.group.name`      | The name of the consumer group (queue group in NATS terminology).                 |
| `messaging.message.conversation_id`  | The conversation ID for request/reply patterns (reply subject).                   |
| `messaging.message.body.size`        | The size of the message body in bytes (opt-in via `includeMessageBodySize`).      |
| `server.address`                     | The NATS server hostname or IP address.                                           |
| `server.port`                        | The NATS server port number.                                                      |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-nats
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-nats.svg
