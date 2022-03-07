# OpenTelemetry mysql Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`mysql2`](https://github.com/sidorares/node-mysql2).

For automatic instrumentation see the
[@opentelemetry/sdk-trace-node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-mysql2
```

## Supported Versions

- `>= 1.4.2, < 3.0`

## Usage

OpenTelemetry MySQL2 Instrumentation allows the user to automatically collect trace data and export them to the backend of choice, to give observability to distributed systems when working with [mysql2](https://github.com/sidorares/node-mysql2).

To load a specific plugin (**MySQL2** in this case), specify it in the registerInstrumentations's configuration

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { MySQL2Instrumentation } = require('@opentelemetry/instrumentation-mysql2');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new MySQL2Instrumentation(),
  ],
})
```

### MySQL2 Instrumentation Options

You can set the following instrumentation options:

| Options | Type | Description |
| ------- | ---- | ----------- |
| `responseHook` | `MySQL2InstrumentationExecutionResponseHook` (function) | Function for adding custom attributes from db response |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-mysql2
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-mysql2
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-mysql2&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-mysql2&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-mysql2
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-mysql2.svg
