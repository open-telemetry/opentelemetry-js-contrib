# OpenTelemetry mongoose Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`mongoose`](https://github.com/Automattic/mongoose) module.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-mongoose
```

## Supported Versions

- [`mongoose`](https://www.npmjs.com/package/mongoose) versions `>=5.9.7 <10`

## Usage

To enable a specific instrumentation, pass it to `registerInstrumentations()`.
This is commonly done via `NodeSDK` for fully setting up all OpenTelemetry SDK components:

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { MongooseInstrumentation } = require('@opentelemetry/instrumentation-mongoose');

const sdk = new NodeSDK({
  instrumentations: [
    new MongooseInstrumentation(),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

## Semantic Conventions

This instrumentation uses Semantic Conventions for database calls and network.

The `instrumentation-mongoose` versions 0.66.0 and later emit the stable v1.33.0+ semantic conventions.

| Attribute            | Description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `db.system.name`     | An identifier for the database management system (DBMS) product being used. Value: 'mongodb' |
| `db.collection.name` | The collection being accessed within the database.                                           |
| `db.namespace`       | The name of the database being accessed.                                                     |
| `db.operation.name`  | The name of the operation being executed.                                                    |
| `db.query.text`      | The database statement being executed (only set when `dbStatementSerializer` is configured). |
| `server.address`     | Remote hostname or similar.                                                                  |
| `server.port`        | Remote port number.                                                                          |

Span name format: `{operation} {collection}` (e.g., `save users`)

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-mongoose
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-mongoose.svg
