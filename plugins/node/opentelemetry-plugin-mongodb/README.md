# OpenTelemetry mongodb Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`mongodb`](https://github.com/mongodb/node-mongodb-native).

For automatic instrumentation see the
[@opentelemetry/node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/plugin-mongodb
```
### Supported Versions
 - `'>=2.0.0 <4`

## Usage

OpenTelemetry Mongodb Instrumentation allows the user to automatically collect trace data and export them to their backend of choice, to give observability to distributed systems.

To load a specific plugin (mongodb in this case), specify it in the registerInstrumentations's configuration.
```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    {
      plugins: {
        mongodb: {
          enabled: true,
          // You may use a package name or absolute path to the file.
          path: '@opentelemetry/plugin-mongodb',
        }
      },
    },
  ],
  tracerProvider: provider,
});

```

To load all of the [supported plugins](https://github.com/open-telemetry/opentelemetry-js#plugins), use below approach. Each plugin is only loaded when the module that it patches is loaded; in other words, there is no computational overhead for listing plugins for unused modules.
```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();
registerInstrumentations({
  tracerProvider: provider,
});
```

See [examples/mongodb](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/mongodb) for a short example.

### Mongo Plugin Options

Mongodb plugin has few options available to choose from. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| [`enhancedDatabaseReporting`](https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-api/src/trace/instrumentation/Plugin.ts#L91) | `string` | If true, additional information about query parameters and results will be attached (as `attributes`) to spans representing database operations |

## Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-plugin-mongodb
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-plugin-mongodb
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-plugin-mongodb&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-plugin-mongodb&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/plugin-mongodb
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fplugin-mongodb.svg
