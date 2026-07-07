# OpenTelemetry MongoDB Instrumentation for Node.js

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

- [`mongodb`](https://www.npmjs.com/package/mongodb) version `>=3.3.0 <8`

## Usage

OpenTelemetry MongoDB Instrumentation allows the user to automatically collect trace data and export them to their backend of choice, to give observability to distributed systems.

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

See [`examples/mongodb`](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/mongodb) for a short example.

### Mongo instrumentation Options

Mongodb instrumentation has few options available to choose from. You can set the following:

| Options                     | Type     | Description |
| --------------------------- | -------- | ----------- |
| `enhancedDatabaseReporting` | boolean  | If true, additional information about query parameters and results will be attached (as `attributes`) to spans representing database operations. |
| `responseHook`              | function | Function for adding custom attributes from db response. See type `MongoDBInstrumentationExecutionResponseHook`. |
| `dbStatementSerializer`     | function | Custom serializer function for the `db.statement` / `db.query.text` span attribute. See type `DbStatementSerializer`. |
| `requireParentSpan`         | boolean  | Require a parent span in order to create mongodb spans, default when unset is `true`. |

## Semantic Conventions

This instrumentation creates spans with database and network attributes following the OpenTelemetry Semantic Conventions.

The `instrumentation-mongodb` versions 0.73.0 and later emit the stable v1.33.0+ semantic conventions.

Span attributes:

| Attribute            | Description |
| -------------------- | ----------- |
| `db.system.name`     | `'mongodb'` |
| `db.namespace`       | The MongoDB database name. |
| `db.operation.name`  | The name of the MongoDB command being executed. |
| `db.collection.name` | The MongoDB collection being accessed within the database stated in `db.namespace`. |
| `db.query.text`      | The database query being executed. |
| `server.address`     | Remote hostname or similar. |
| `server.port`        | Remote port number. |

Metrics collected:

- [`db.client.connection.count`](https://opentelemetry.io/docs/specs/semconv/database/database-metrics/#metric-dbclientconnectioncount) - The number of connections currently in a given state.

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
