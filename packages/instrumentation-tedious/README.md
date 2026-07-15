# OpenTelemetry Tedious Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`tedious`](https://github.com/tediousjs/tedious) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-tedious
```

## Supported Versions

- [tedious](https://www.npmjs.com/package/tedious) `>=1.11.0 <21`

## Usage

OpenTelemetry Tedious Instrumentation allows the user to automatically collect trace data and export them to the backend of choice, to give observability to distributed systems when working with [`tedious`](https://github.com/tediousjs/tedious).

To load a specific plugin, specify it in the registerInstrumentations's configuration:

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { TediousInstrumentation } = require('@opentelemetry/instrumentation-tedious');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new TediousInstrumentation(),
  ],
})
```

## Semantic Conventions

This instrumentation creates spans with attributes from the stable database and networking semantic conventions.

The `instrumentation-tedious` versions 0.39.0 and later emit the stable v1.33.0+ semantic conventions.

| Attribute             | Description                                                                           |
| --------------------- | ------------------------------------------------------------------------------------- |
| `db.system.name`      | Database system identifier: `'microsoft.sql_server'`                                  |
| `db.query.text`       | The database query being executed.                                                    |
| `db.namespace`        | The database associated with the connection.                                          |
| `db.collection.name`  | The name of a collection (table, container) within the database.                      |
| `server.address`      | Remote hostname or similar.                                                           |
| `server.port`         | Remote port number.                                                                   |

### Trace Context Propagation

Database trace context propagation can be enabled by setting `enableTraceContextPropagation`to `true`.
This uses the [SET CONTEXT_INFO](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-context-info-transact-sql?view=sql-server-ver16)
command to set [traceparent](https://www.w3.org/TR/trace-context/#traceparent-header)information
for the current connection, which results in **an additional round-trip to the database**.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-tedious
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-tedious.svg
