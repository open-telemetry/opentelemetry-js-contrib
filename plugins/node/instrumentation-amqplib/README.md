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

- `>=0.5.5`

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
    }),
  ],
})
```

### amqplib Instrumentation Options

amqplib instrumentation has few options available to choose from. You can set the following:

| Options                           | Type                                      | Description                                                                                                                |
| --------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `publishHook`                  | `AmqplibPublishCustomAttributeFunction`    | hook for adding custom attributes before publish message is sent.                                             |
| `publishConfirmHook`                  | `AmqplibPublishConfirmCustomAttributeFunction`    | hook for adding custom attributes after publish message is confirmed by the broker.                                             |
| `consumeHook`                  | `AmqplibConsumeCustomAttributeFunction`    | hook for adding custom attributes before consumer message is processed.                                             |
| `consumeEndHook`                  | `AmqplibConsumeEndCustomAttributeFunction`    | hook for adding custom attributes after consumer message is acked to server.                                             |
| `consumeTimeoutMs`                  | `number`    | read [Consume Timeout](#ConsumeTimeout) below                                             |

### Consume Timeout

When user is setting up consume callback, it is user's responsibility to call ack/nack etc on the msg to resolve it in the server. If user is not calling the ack, the message will stay in the queue until channel is closed, or until server timeout expires (if configured).

While we wait for the ack, a reference to the message is stored in plugin, which
will never be garbage collected.
To prevent memory leak, plugin has it's own configuration of timeout, which will close the span if user did not call ack after this timeout.

If timeout is not big enough, span might be closed with 'InstrumentationTimeout', and then received valid ack from the user later which will not be instrumented.

Default is 1 minute

## Migration From opentelemetry-instrumentation-amqplib

This instrumentation was originally published under the name `"opentelemetry-instrumentation-amqplib"` in [this repo](https://github.com/aspecto-io/opentelemetry-ext-js). Few breaking changes were made during porting to the contrib repo to align with conventions:

### Hook Info

The instrumentation's config `publishHook`, `publishConfirmHook`, `consumeHook` and `consumeEndHook` functions signature changed, so the second function parameter is info object, containing the relevant hook data.

### `moduleVersionAttributeName` config option

The `moduleVersionAttributeName` config option is removed. To add the amqplib package version to spans, use the `moduleVersion` attribute in hook info for `publishHook` and `consumeHook` functions.

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
