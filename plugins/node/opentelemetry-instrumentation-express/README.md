# OpenTelemetry Express Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`express`](https://github.com/expressjs/express).

For automatic instrumentation see the
[@opentelemetry/node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-express
```
### Supported Versions
 - `^4.0.0`

## Usage

OpenTelemetry Express Instrumentation allows the user to automatically collect trace data and export them to their backend of choice, to give observability to distributed systems.

To load a specific instrumentation (express in this case), specify it in the Node Tracer's configuration.
```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');

const provider = new NodeTracerProvider();
provider.register();
new ExpressInstrumentation();
```

See [examples/express](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/express) for a short example.

### Caveats

Because of the way express works, it's hard to correctly compute the time taken by asynchronous middlewares and request handlers. For this reason, the time you'll see reported for asynchronous middlewares and request handlers will only represent the synchronous execution time, and **not** any asynchronous work.

### Express Instrumentation Options

Express instrumentation has few options available to choose from. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| `ignoreLayers` | `IgnoreMatcher[]` | Express instrumentation will not trace all layers that match. |
| `ignoreLayersType`| `ExpressLayerType[]` | Express instrumentation will ignore the layers that match based on their type. |

For reference, here are the three different layer type:
  - `router` is the name of `express.Router()`
  - `middleware`
  - `request_handler` is the name for anything thats not a router or a middleware.

## Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-express
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-express
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-express&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-express&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-dns
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-dns.svg
