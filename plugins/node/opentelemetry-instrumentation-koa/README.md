# OpenTelemetry Koa Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [Koa](https://github.com/koajs/koa) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-koa
```

### Supported Versions

- `koa`: `^2.0.0`
- `@koa/router`: `>=8`

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

See [`examples`](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-koa/examples) for a short example using both Koa and @koa/router.

Note that generator-based middleware are deprecated and won't be instrumented.

### Koa Instrumentation Options

| Options | Type | Example | Description |
| ------- | ---- | ------- | ----------- |
| `ignoreLayersType`| `KoaLayerType[]` | `['middleware']` | Ignore layers of specified type. |
| `requestHook` | `KoaRequestCustomAttributeFunction` | `(span, info) => {}` | Function for adding custom attributes to Koa middleware layers. Receives params: `Span, KoaRequestInfo`. |

`ignoreLayersType` accepts an array of `KoaLayerType` which can take the following string values:

- `router`,
- `middleware`.

#### Using `requestHook`

Instrumentation configuration accepts a custom "hook" function which will be called for every instrumented Koa middleware layer involved in a request. Custom attributes can be set on the span or run any custom logic per layer.

```javascript
import { KoaInstrumentation } from "@opentelemetry/instrumentation-koa"

const koaInstrumentation = new KoaInstrumentation({
  requestHook: function (span: Span, info: KoaRequestInfo) {
    span.setAttribute(
      'http.method',
      info.context.request.method
    )
  }
});
```

## Koa Packages

This package provides automatic tracing for middleware added using either the core [`koa`](https://github.com/koajs/koa) package or the [`@koa/router`](https://github.com/koajs/router) package.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-koa
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-koa.svg
