# OpenTelemetry MySQL Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`mysql`](https://www.npmjs.com/package/mysql) module.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-mysql
```

## Supported Versions

- [`mysql`](https://www.npmjs.com/package/mysql) versions `>=2.0.0 <3`

## Usage

OpenTelemetry MySQL Instrumentation allows the user to automatically collect trace data and export them to the backend of choice, to give observability to distributed systems when working with [mysql](https://www.npmjs.com/package/mysql).

To enable a specific instrumentation, pass it to `registerInstrumentations()`.
This is commonly done via `NodeSDK` for fully setting up all OpenTelemetry SDK components:

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { MySQLInstrumentation } = require('@opentelemetry/instrumentation-mysql');

const sdk = new NodeSDK({
  instrumentations: [
    new MySQLInstrumentation(),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

See [examples/mysql](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/mysql) for a short example.

### MySQL instrumentation Options

| Options                                           | Type      | Default | Description |
| ------------------------------------------------- | --------- | ------- | ----------- |
| [`enhancedDatabaseReporting`](./src/types.ts#L24) | `boolean` | `false` | If true, a `db.mysql.values` attribute containing the query's parameters will be add to database spans. Note that this is not an attribute defined in [Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/database/mysql/). |

## Semantic Conventions

The `instrumentation-mysql` versions 0.66.0 and later emit the stable v1.33.0+ semantic conventions.

Attributes collected:

| Attribute        | Description |
| ---------------- | ----------- |
| `db.system.name` | The database system. Always `'mysql'`. |
| `db.namespace`   | The database associated with the connection, as provided at connection time. (This does not track changes made via `SELECT DATABASE()`.) |
| `db.query.text`  | The database query being executed. |
| `server.address` | Remote hostname or similar. |
| `server.port`    | Remote port number. |

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
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-mysql
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-mysql.svg
