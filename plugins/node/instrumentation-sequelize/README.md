# OpenTelemetry `sequelize` Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`sequelize`](https://www.npmjs.com/package/sequelize) package, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-sequelize
```

### Supported versions

- [`sequelize`](https://www.npmjs.com/package/sequelize) versions `>=6 <7`

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { SequelizeInstrumentation } = require('@opentelemetry/instrumentation-sequelize');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new SequelizeInstrumentation({
      // see below for available configuration
    }),
  ],
});
export interface SequelizeInstrumentationConfig extends InstrumentationConfig {
  /** Hook for adding custom attributes using the query */
  queryHook?: SequelizeQueryHook;
  /** Hook for adding custom attributes using the response payload */
  responseHook?: SequelizeResponseCustomAttributesFunction;
  /** Set to true if you only want to trace operation which has parent spans */
  ignoreOrphanedSpans?: boolean;
  /**
   * Sequelize operation use postgres/mysql/mariadb/etc. under the hood.
   * If, for example, postgres instrumentation is enabled, a postgres operation will also create
   * a postgres span describing the communication.
   * Setting the `suppressInternalInstrumentation` config value to `true` will
   * cause the instrumentation to suppress instrumentation of underlying operations.
   */
  suppressInternalInstrumentation?: boolean;
 * An identifier for the database management system (DBMS) product being used. See below for a list of well-known identifiers.
```

### Instrumentation Options

You can set the following:

| Options                           | Type                                        | Description                                                                                    |
| --------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `queryHook`                       | `SequelizeQueryHook`                        | Function called before running the query. Allows for adding custom attributes to the span.     |
| `responseHook`                    | `SequelizeResponseCustomAttributesFunction` | Function called after a response is received. Allows for adding custom attributes to the span. |
| `ignoreOrphanedSpans`             | `boolean`                                   | Can be set to only produce spans which have parent spans. Default: `false`                     |
| `suppressInternalInstrumentation` | `boolean`                                   | Set to ignore the underlying database library instrumentation. Default: `false`                |

## Semantic Conventions

This package uses `@opentelemetry/semantic-conventions` version `1.25+`, which implements Semantic Convention [Version 1.7.0](https://github.com/open-telemetry/opentelemetry-specification/blob/v1.7.0/semantic_conventions/README.md)

Attributes collected:

| Attribute       | Short Description                                                           |
| ----------------| --------------------------------------------------------------------------- |
| `db.name`       | The name of the database being accessed.                                    |
| `db.operation`  | The name of the operation being executed.                                   |
| `db.statement`  | The database statement being executed.                                      |
| `db.sql.table`  | The name of the table being used.                                           |
| `db.system`     | An identifier for the database management system (DBMS) product being used. |
| `db.user`       | Username for accessing the database.                                        |
| `net.peer.name` | Remote hostname of the database.                                            |
| `net.peer.port` | Port of the database.                                                       |
| `net.transport` | The transport protocol being used.                                          |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-sequelize
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-sequelize.svg
