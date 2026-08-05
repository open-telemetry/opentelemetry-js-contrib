# OpenTelemetry Knex Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`knex`](https://github.com/knex/knex) module. This module allows the user to automatically collect trace data and export them to their backend of choice.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-knex
```

### Supported Versions

- [`knex`](https://www.npmjs.com/package/knex) versions `>=0.10.0 <4`

## Usage

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { KnexInstrumentation } = require('@opentelemetry/instrumentation-knex');

const sdk = new NodeSDK({
  instrumentations: [
    new KnexInstrumentation({
      // See below for configuration options.
    }),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

### Configuration Options

| Options | Type | Example | Description |
| ------- | ---- | ------- | ----------- |
| `maxQueryLength` | `number` | `100` | Truncate `db.query.text` attribute to a maximum length. If the statement is truncated `'..'` is added to its end. Default `1022`. `-1` leaves `db.query.text` untouched. |
| `requireParentSpan` | `boolean` | `false` | Don't create spans unless they are part of an existing trace. Default is `false`. |

## Semantic Conventions

This instrumentation creates spans with database-related attributes.

The `instrumentation-knex` versions 0.64.0 and later emit the stable v1.33.0+ semantic conventions.

| Attribute              | Short Description                                                           |
| ---------------------- | --------------------------------------------------------------------------- |
| `db.collection.name`   | The name of the primary table that the operation is acting upon.            |
| `db.namespace`         | The name of the database being accessed.                                    |
| `db.operation.name`    | The name of the operation being executed.                                   |
| `db.query.text`        | The database statement being executed.                                      |
| `db.system.name`       | An identifier for the database management system (DBMS) product being used. |
| `server.address`       | Remote hostname or similar.                                                 |
| `server.port`          | Remote port number.                                                         |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-knex
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-knex.svg
