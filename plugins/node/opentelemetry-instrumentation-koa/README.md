# OpenTelemetry Koa Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`Koa`](https://github.com/koajs/koa).

For automatic instrumentation see the
[@opentelemetry/sdk-trace-node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-koa
```

### Supported Versions

- Koa `^2.0.0`

## Usage

OpenTelemetry Koa Instrumentation allows the user to automatically collect trace data and export them to their backend of choice, to give observability to distributed systems.

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { KoaInstrumentation } = require('@opentelemetry/instrumentation-koa');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new KoaInstrumentation(),
  ],
});
```

See [examples/koa](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/koa) for a short example using both Koa and @koa/router

## Koa Packages

This package provides automatic tracing for middleware added using either the core [`Koa`](https://github.com/koajs/koa) package or the [`@koa/router`](https://github.com/koajs/router) package.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-koa
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-koa
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-koa&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-koa&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-koa
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-koa.svg
