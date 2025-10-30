# OpenTelemetry `typeorm` Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`typeorm`](https://www.npmjs.com/package/typeorm) package, which may be loaded using the [`@opentelemetry/instrumentation`](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation) package.

If total installation size is not constrained, it is recommended to use [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API `^1.3.0` and SDK `2.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-typeorm
```

## Supported versions

- [`typeorm`](https://www.npmjs.com/package/typeorm) versions `>=0.3.0 <1`

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { TypeormInstrumentation } = require('@opentelemetry/instrumentation-typeorm');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new TypeormInstrumentation({
      // see below for available configuration
    }),
  ],
});
```

### Instrumentation Options

You can set the following:

| Options                      | Type                                   | Description                                                                   |
| ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------|
| `responseHook` | `TypeormResponseCustomAttributesFunction` | Hook called before response is returned, which allows to add custom attributes to span.  |
| `suppressInternalInstrumentation` | boolean | Typeorm uses mongodb/postgres/mysql/mariadb/etc. under the hood. If, for example, postgres instrumentation is enabled, a postgres operation will also create a postgres span describing the communication. Setting the `suppressInternalInstrumentation` config value to `true` will cause the instrumentation to suppress instrumentation of underlying operations. |
| `enableInternalInstrumentation` | boolean |  Some methods such as `getManyAndCount` can generate internally multiple spans. To instrument those set this to `true` |
| `enhancedDatabaseReporting` | boolean | set to `true` if you want to capture the parameter values for parameterized SQL queries (**may leak sensitive information**) |

## Semantic Conventions

Attributes collected:

| Attribute            | Short Description                                                           |
| ---------------------| --------------------------------------------------------------------------- |
| `db.namespace`       | The name of the database being accessed.                                    |
| `db.operation.name`  | The name of the operation being executed (e.g. the SQL keyword).            |
| `db.collection.name` | The name of the table being accessed.                                       |
| `db.query.text`      | The database statement being executed.                                      |
| `db.system.name`     | An identifier for the database management system (DBMS) product being used. |
| `server.address`     | Remote address of the database.                                             |
| `server.port`        | Peer port number of the network connection.                                 |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-typeorm
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-typeorm.svg
