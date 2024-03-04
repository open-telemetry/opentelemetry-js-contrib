# OpenTelemetry Undici/fetch Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

**Note: This is an experimental package under active development. New releases may include breaking changes.**

This module provides automatic instrumentation for [`undici`](https://undici.nodejs.org/) and [`fetch`](https://nodejs.org/docs/latest/api/globals.html#fetch).

## Installation

```bash
npm install --save @opentelemetry/instrumentation-undici
```

## Usage

OpenTelemetry Undici/fetch Instrumentation allows the user to automatically collect trace data and export them to their backend of choice, to give observability to distributed systems.

To load a specific instrumentation (Undici in this case), specify it in the Node Tracer's configuration.

```js
const { UndiciInstrumentation } = require('@opentelemetry/instrumentation-undici');
const {
  ConsoleSpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();

provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

registerInstrumentations({
  instrumentations: [new UndiciInstrumentation()],
});

```

See [examples/undici](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/undici) for a short example.

### Undici/Fetch instrumentation Options

Undici instrumentation has few options available to choose from. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| [`ignoreRequestHook`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-undici/src/types.ts#61) | `IgnoreRequestFunction` | Undici instrumentation will not trace all incoming requests that matched with custom function. |
| [`applyCustomAttributesOnSpan`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-undici/src/types.ts#63) | `CustomAttributesFunction` | Function for adding custom attributes before response is handled. |
| [`requestHook`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-undici/src/types.ts#65) | `RequestHookFunction` | Function for adding custom attributes before request is handled. |
| [`startSpanHook`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-undici/src/types.ts#67) | `StartSpanHookFunction` | Function for adding custom attributes before a span is started. |
| [`requireParentforSpans`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-undici/src/types.ts#69) | `Boolean` | Require a parent span is present to create new span for outgoing requests. |
| [`headersToSpanAttributes`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-undici/src/types.ts#71) | `Object` |  List of case insensitive HTTP headers to convert to span attributes. Headers will be converted to span attributes in the form of `http.{request\|response}.header.header-name` where the name is only lowecased, e.g. `http.response.header.content-length`|

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-router
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-router.svg
