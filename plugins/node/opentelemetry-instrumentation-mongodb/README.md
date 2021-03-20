# OpenTelemetry mongodb Instrumentation for Node.js
[![Gitter chat][gitter-image]][gitter-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`mongodb`](https://github.com/mongodb/node-mongodb-native).

For automatic instrumentation see the
[@opentelemetry/node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-mongodb
```
### Supported Versions
 - `'>=3.3 <4`

## Usage

OpenTelemetry Mongodb Instrumentation allows the user to automatically collect trace data and export them to their backend of choice, to give observability to distributed systems.

To load a specific instrumentation (**mongodb** in this case), specify it in the Node Tracer's configuration.

```javascript
const { NodeTracerProvider } = require('@opentelemetry/node');
const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');

const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

const mongodbInstrumentation = new MongoDBInstrumentation({
  // see under for available configuration
});
```

### Mongo instrumentation Options

Mongodb instrumentation has few options available to choose from. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| [`enhancedDatabaseReporting`](https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-api/src/trace/instrumentation/instrumentation.ts#L91) | `string` | If true, additional information about query parameters and results will be attached (as `attributes`) to spans representing database operations |


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
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/status.svg?path=packages/opentelemetry-instrumentation-mongodb
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-mongodb
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/dev-status.svg?path=packages/opentelemetry-instrumentation-mongodb
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-mongodb&type=dev
