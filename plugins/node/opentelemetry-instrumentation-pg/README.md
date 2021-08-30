# OpenTelemetry Postgres Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`pg and pg-pool`](https://github.com/brianc/node-postgres)

For automatic instrumentation see the
[@opentelemetry/sdk-trace-node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-pg
```

It will install Instrumentation for PG and PG-POOL

## Usage

```js
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new PgInstrumentation(),
  ],
});
```

PgInstrumentation contains both pg and [`pg.Pool`](https://node-postgres.com/api/pool) so it will be instrumented automatically.

See [examples/postgres](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/postgres) for a short example.

### PostgreSQL Instrumentation Options

PostgreSQL instrumentation has few options available to choose from. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| [`enhancedDatabaseReporting`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-pg/src/pg.ts#L48) | `boolean` | If true, additional information about query parameters and results will be attached (as `attributes`) to spans representing database operations |
| `responseHook` | `PgInstrumentationExecutionResponseHook` (function) | Function for adding custom attributes from db response |

## Supported Versions

- [pg](https://npmjs.com/package/pg): `7.x`, `8.*`
- [pg-pool](https://npmjs.com/package/pg-pool): `2.x`, `3.*` (Installed by `pg`)

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-pg
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-pg
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-pg&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-pg&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-pg
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-pg.svg
