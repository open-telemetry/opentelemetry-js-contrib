# OpenTelemetry NATS Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`nats`](https://nats.io/).

For automatic instrumentation see the
[@opentelemetry/sdk-trace-node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-nats
```

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { NatsInstrumentation } = require('@opentelemetry/instrumentation-nats');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new NatsInstrumentation({
      // see under for available configuration
    }),
  ],
});
```

### Nats Instrumentation Options

Nats instrumentation has currently one option. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |

## Known limitations

Currently, this library does not set context correctly when using nats async
iterators API. To guarantee proper attribution of parent spans, please using the
[callback API](https://github.com/nats-io/nats.js#async-vs-callbacks) for now.
This should hopefully be fixed once this [addition to the context
API](https://github.com/open-telemetry/opentelemetry-js-api/pull/123) lands.

Additionally, because this wraps the original nats library and performs
callouts outside of it, it means that it could interrupt the normal flow of the
nats client, and create hard-to-diagnose issues such as slow-consumers, and/or
memory growth that wouldn't appear in the standard client. That said, this is
true for every opentelemetry instrumentation, but something one should be aware
of regardless.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-nats
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-nats
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-nats&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-nats&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-nats
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-nats.svg
