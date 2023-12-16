# OpenTelemetry Esbuild for Node

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-url]

## About

This module provides a way to auto instrument any Node application to capture telemetry from a number of popular libraries and frameworks, via an [esbuild](https://esbuild.github.io/) plugin.
You can export the telemetry data in a variety of formats. Exporters, samplers, and more can be configured via [environment variables][env-var-url].
The net result is the ability to gather telemetry data from a Node application without any code changes.

This module also provides a simple way to manually initialize multiple Node instrumentations for use with the OpenTelemetry SDK.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/esbuild-plugin-node
```

## Usage: Esbuild plugin

This module includes auto instrumentation for all supported instrumentations and [all available data exporters][exporter-url].
It provides a completely automatic, out-of-the-box experience.
Please see the [Supported Instrumentations](#supported-instrumentations) section for more information.

Enable auto instrumentation by configuring it in your esbuild script:

```javascript
const { openTelemetryPlugin } = require('@opentelemetry/esbuild-plugin-node');
const { build } = require('esbuild');

build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  outfile: 'dist/server.js',
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  plugins: [openTelemetryPlugin()],
}).catch(err => {
  throw err;
});
```

## Usage: Instrumentation Initialization

OpenTelemetry Meta Packages for Node automatically loads instrumentations for Node builtin modules and common packages.

Enable auto instrumentation by configuring it in your esbuild script:

```javascript
const { openTelemetryPlugin } = require('@opentelemetry/esbuild-plugin-node');
const { build } = require('esbuild');

build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  outfile: 'dist/server.js',
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  plugins: [openTelemetryPlugin()],
}).catch(err => {
  throw err;
});
```

Custom configuration for each of the instrumentations can be passed to the plugin, by providing an object with the name of the instrumentation as a key, and its configuration as the value.

```javascript
const { openTelemetryPlugin } = require('@opentelemetry/esbuild-plugin-node');
const { build } = require('esbuild');

build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  outfile: 'dist/server.js',
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  plugins: [
    openTelemetryPlugin({
      '@opentelemetry/instrumentation-pino': {
        logHook: (span, record) => {
          // Reformat the injected log fields to use camelCase, eg. trace_id -> traceId
          const context = span.spanContext();
          record.traceId = context.traceId;
          record.spanId = context.spanId;
          record.strTraceFlags = context.traceFlags;

          if (record.trace_id === context.traceId) delete record.trace_id;
          if (record.span_id === context.spanId) delete record.span_id;
          if (Number(record.trace_flags) === context.traceFlags)
            delete record.trace_flags;
        },
      },
    }),
  ],
}).catch(err => {
  throw err;
});
```

This esbuild script will instrument non-builtin packages but will not configure the rest of the OpenTelemetry SDK to export traces
from your application. To do that you must also configure the SDK.

The esbuild script currently only patches non-builtin modules (more specifically, modules in [opentelemetry-js-contrib](https://github.com/open-telemetry/opentelemetry-js-contrib)), so this is also the place to configure the instrumentation
for builtins or add any additional instrumentations.

### Gotchas

There are limitations to the configuration options for each package. Most notably, any functions (like `ignoreIncomingRequestHook` in the example) must not depend on any scope outside the function itself, including but not limited to module level variables and imports.

The reason for this is that the current mechanism of instrumenting packages involves stringifying the instrumentation configs, which does not account for any external scoped dependencies.

```javascript
const {
  getNodeAutoInstrumentations,
} = require('@opentelemetry/auto-instrumentations-node');
const {
  AsyncHooksContextManager,
} = require('@opentelemetry/context-async-hooks');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-http');
const { NodeSDK } = require('@opentelemetry/sdk-node');

const instrumentations = getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-http': {
    ignoreIncomingRequestHook: request => {
      // GET /metrics is for fetching prometheus metrics,
      // which generates a ton of noise and is not very interesting
      return request.method === 'GET' && request.url === '/metrics';
    },
  },
});

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  contextManager: new AsyncHooksContextManager().enable(),
  instrumentations,
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
```

## Supported instrumentations

- [@opentelemetry/instrumentation-amqplib](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/instrumentation-amqplib)
- [@opentelemetry/instrumentation-aws-lambda](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-aws-lambda)
- [@opentelemetry/instrumentation-aws-sdk](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-aws-sdk)
- [@opentelemetry/instrumentation-bunyan](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-bunyan)
- [@opentelemetry/instrumentation-cassandra-driver](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-cassandra)
- [@opentelemetry/instrumentation-connect](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-connect)
- [@opentelemetry/instrumentation-cucumber](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/instrumentation-cucumber)
- [@opentelemetry/instrumentation-dataloader](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/instrumentation-dataloader)
- [@opentelemetry/instrumentation-dns](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-dns)
- [@opentelemetry/instrumentation-express](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-express)
- [@opentelemetry/instrumentation-fastify](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-fastify)
- [@opentelemetry/instrumentation-generic-pool](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-generic-pool)
- [@opentelemetry/instrumentation-graphql](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-graphql)
- [@opentelemetry/instrumentation-grpc](https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation-grpc)
- [@opentelemetry/instrumentation-hapi](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-hapi)
- [@opentelemetry/instrumentation-http](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation-http)
- [@opentelemetry/instrumentation-ioredis](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-ioredis)
- [@opentelemetry/instrumentation-knex](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-knex)
- [@opentelemetry/instrumentation-koa](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-koa)
- [@opentelemetry/instrumentation-lru-memoizer](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/instrumentation-lru-memoizer)
- [@opentelemetry/instrumentation-memcached](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-memcached)
- [@opentelemetry/instrumentation-mongodb](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-mongodb)
- [@opentelemetry/instrumentation-mongoose](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/instrumentation-mongoose)
- [@opentelemetry/instrumentation-mysql](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-mysql)
- [@opentelemetry/instrumentation-mysql2](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-mysql2)
- [@opentelemetry/instrumentation-nestjs-core](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-nestjs-core)
- [@opentelemetry/instrumentation-net](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-net)
- [@opentelemetry/instrumentation-pg](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-pg)
- [@opentelemetry/instrumentation-pino](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-pino)
- [@opentelemetry/instrumentation-redis](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-redis)
- [@opentelemetry/instrumentation-restify](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-restify)
- [@opentelemetry/instrumentation-socket.io](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/instrumentation-socket.io)
- [@opentelemetry/instrumentation-winston](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-winston)

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fauto-instrumentations-node.svg
[env-var-url]: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/configuration/sdk-environment-variables.md#general-sdk-configuration
[exporter-url]: https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/configuration/sdk-environment-variables.md#otlp-exporter
[require-url]: https://nodejs.org/api/cli.html#-r---require-module
