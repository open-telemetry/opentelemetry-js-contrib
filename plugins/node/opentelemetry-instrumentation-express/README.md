# OpenTelemetry Express Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`express`](https://github.com/expressjs/express).

For automatic instrumentation see the
[@opentelemetry/sdk-trace-node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

This instrumentation relies on HTTP calls to also be instrumented. Make sure you install and enable both, otherwise you will not see any spans being exported from the instrumentation.

```bash
npm install --save @opentelemetry/instrumentation-http @opentelemetry/instrumentation-express
```

### Supported Versions

- `^4.0.0`

## Usage

OpenTelemetry Express Instrumentation allows the user to automatically collect trace data and export them to their backend of choice, to give observability to distributed systems.

To load the instrumentation, specify it in the Node Tracer's configuration:

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    // Express instrumentation expects HTTP layer to be instrumented
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
  ],
});
```

See [examples/express](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/express) for a short example.

### Caveats

Because of the way express works, it's hard to correctly compute the time taken by asynchronous middlewares and request handlers. For this reason, the time you'll see reported for asynchronous middlewares and request handlers still only represent the synchronous execution time, and **not** any asynchronous work.

### Express Instrumentation Options

Express instrumentation has few options available to choose from. You can set the following:

| Options | Type | Example | Description |
| ------- | ---- | ------- | ----------- |
| `ignoreLayers` | `IgnoreMatcher[]` | `[/^\/_internal\//]` | Ignore layers that by match. |
| `ignoreLayersType`| `ExpressLayerType[]` | `['request_handler']` | Ignore layers of specified type. |

`ignoreLayers` accepts an array of elements of types:

- `string` for full match of the path,
- `RegExp` for partial match of the path,
- `function` in the form of `(path) => boolean` for custom logic.

`ignoreLayersType` accepts an array of following strings:

- `router` is the name of `express.Router()`,
- `middleware`,
- `request_handler` is the name for anything that's not a router or a middleware.

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
