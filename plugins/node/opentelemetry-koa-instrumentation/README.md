# OpenTelemetry Koa Instrumentation for Node.js
[![Gitter chat][gitter-image]][gitter-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`Koa`](https://github.com/koajs/koa).

For automatic instrumentation see the
[@opentelemetry/node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/koa-instrumentation
```
### Supported Versions
 - Koa `^2.0.0`

## Usage

OpenTelemetry Koa Instrumentation allows the user to automatically collect trace data and export them to their backend of choice, to give observability to distributed systems.

To load a specific instrumentation (Koa in this case), specify it in the Node Tracer's configuration.
```js
const { NodeTracerProvider } = require('@opentelemetry/node');

const provider = new NodeTracerProvider({
  plugins: {
    koa: {
      enabled: true,
      // You may use a package name or absolute path to the file.
      path: '@opentelemetry/koa-instrumentation',
    }
  }
});
```

To load all of the [supported instrumentations](https://github.com/open-telemetry/opentelemetry-js#plugins), use below approach. Each instrumentation is only loaded when the module that it patches is loaded; in other words, there is no computational overhead for listing instrumentations for unused modules.
```js
const { NodeTracerProvider } = require('@opentelemetry/node');

const provider = new NodeTracerProvider();
```

See [examples/koa](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/koa) for a short example using both Koa and @koa/router

## Koa Packages

This package provides automatic tracing for middleware added using either the core [`Koa`](https://github.com/koajs/koa) package or the [`@koa/router`](https://github.com/koajs/router) package. 

## Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/open-telemetry/opentelemetry-js.svg
[gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/status.svg?path=plugins/node/opentelemetry-koa-instrumentation
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins/node/opentelemetry-koa-instrumentation
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/dev-status.svg?path=plugins/node/opentelemetry-koa-instrumentation
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins/node/opentelemetry-koa-instrumentation&type=dev
