# OpenTelemetry Postgres Instrumentation for Node.js
[![Gitter chat][gitter-image]][gitter-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`pg and pg-pool`](https://github.com/brianc/node-postgres)

For automatic instrumentation see the
[@opentelemetry/node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-pg
```

It will install Instrumentation for PG and PG-POOL

## Usage

To load all of the [default supported plugins](https://github.com/open-telemetry/opentelemetry-js#plugins), use the below approach. Each plugin is only loaded when the module that it patches is loaded; in other words, there is no computational overhead for listing plugins for unused modules.

```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const provider = new NodeTracerProvider();
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
registerInstrumentations({
  tracerProvider: provider,
});
```

If instead you would just want to load a specific instrumentation (**pg** in this case);

```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { PostgresInstrumentation } = require('@opentelemetry/instrumentation-pg');

const provider = new NodeTracerProvider();
const pgInstrumentation = new PostgresInstrumentation();
pgInstrumentation.setTracerProvider(provider);
```

PostgresInstrumentation contains both pg and [`pg.Pool`](https://node-postgres.com/api/pool) so it will be instrumented automatically.

See [examples/postgres](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/postgres) for a short example.

### PostgreSQL Instrumentation Options

PostgreSQL instrumentation has few options available to choose from. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| [`enhancedDatabaseReporting`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-pg/src/pg.ts#L48) | `boolean` | If true, additional information about query parameters and results will be attached (as `attributes`) to spans representing database operations |

## Supported Versions

- [pg](https://npmjs.com/package/pg): `7.x`, `8.*`
- [pg-pool](https://npmjs.com/package/pg-pool): `2.x`, `3.*` (Installed by `pg`)

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
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/status.svg?path=packages/opentelemetry-instrumentation-pg
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-pg
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/dev-status.svg?path=packages/opentelemetry-instrumentation-pg
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-pg&type=dev
