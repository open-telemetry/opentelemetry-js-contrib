# OpenTelemetry mongodb Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`mongodb`](https://github.com/mongodb/node-mongodb-native) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-mongodb
```

### Supported Versions

- `>=3.3 <5`

## Usage

OpenTelemetry Mongodb Instrumentation allows the user to automatically collect trace data and export them to their backend of choice, to give observability to distributed systems.

To load a specific instrumentation (**mongodb** in this case), specify it in the Node Tracer's configuration.

```javascript
const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new MongoDBInstrumentation({
      // see under for available configuration
    }),
  ],
});

```

### Mongo instrumentation Options

Mongodb instrumentation has few options available to choose from. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| [`enhancedDatabaseReporting`](./src/types.ts#L32) | `string` | If true, additional information about query parameters and results will be attached (as `attributes`) to spans representing database operations |
| `responseHook` | `MongoDBInstrumentationExecutionResponseHook` (function) | Function for adding custom attributes from db response |
| `dbStatementSerializer` | `DbStatementSerializer` (function) | Custom serializer function for the db.statement tag |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-mongodb
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-mongodb.svg
