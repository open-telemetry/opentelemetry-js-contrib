# OpenTelemetry Postgres Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`pg`](https://github.com/brianc/node-postgres).

For automatic instrumentation see the
[@opentelemetry/node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/plugin-pg
npm install --save @opentelemetry/plugin-pg-pool
```

## Usage

To load all of the [default supported plugins](https://github.com/open-telemetry/opentelemetry-js#plugins), use the below approach. Each plugin is only loaded when the module that it patches is loaded; in other words, there is no computational overhead for listing plugins for unused modules.

```js
const { NodeTracerProvider } = require('@opentelemetry/node');

const provider = new NodeTracerProvider(); // All default plugins will be used
```

If instead you would just want to load a specific plugin (**pg** in this case), specify it in the `NodeTracer` configuration.

```js
const { NodeTracerProvider } = require('@opentelemetry/node');

const provider = new NodeTracerProvider({
  plugins: {
    pg: {
      enabled: true,
      // You may use a package name or absolute path to the module
      path: '@opentelemetry/plugin-pg',
    }
  }
});
```

If you are using any of the [`pg.Pool`](https://node-postgres.com/api/pool) APIs, you will also need to include the [`pg-pool` plugin](../opentelemetry-plugin-pg-pool).

```js
const { NodeTracerProvider } = require('@opentelemetry/node');

const provider = new NodeTracerProvider({
  plugins: {
    pg: {
      enabled: true,
      // You may use a package name or absolute path to the module
      path: '@opentelemetry/plugin-pg',
    },
    'pg-pool': {
      enabled: true,
      // You may use a package name or absolute path to the module
      path: '@opentelemetry/plugin-pg-pool',
    },
  }
});
```

See [examples/postgres](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/postgres) for a short example.

### PostgreSQL Plugin Options

PostgreSQL plugin has few options available to choose from. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| [`enhancedDatabaseReporting`](https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-api/src/trace/instrumentation/Plugin.ts#L90) | `boolean` | If true, additional information about query parameters and results will be attached (as `attributes`) to spans representing database operations |

## Supported Versions

- [pg](https://npmjs.com/package/pg): `7.x`
- [pg-pool](https://npmjs.com/package/pg-pool): `2.x` (Installed by `pg`)

## Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-plugin-pg
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-plugin-pg
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-plugin-pg&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-plugin-pg&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/plugin-pg
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fplugin-pg.svg
