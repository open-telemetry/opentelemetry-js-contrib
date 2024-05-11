# OpenTelemetry Meta Packages for Node

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-url]

## About

This module provides a way to auto instrument any Node application to capture telemetry from a number of popular libraries and frameworks.
You can export the telemetry data in a variety of formats. Exporters, samplers, and more can be configured via [environment variables][env-var-url].
The net result is the ability to gather telemetry data from a Node application without any code changes.

This module also provides a simple way to manually initialize multiple Node instrumentations for use with the OpenTelemetry SDK.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/api
npm install --save @opentelemetry/auto-instrumentations-node
```

## Usage: Auto Instrumentation

This module includes auto instrumentation for all supported instrumentations and [all available data exporters][exporter-url].
It provides a completely automatic, out-of-the-box experience.
Please see the [Supported Instrumentations](#supported-instrumentations) section for more information.

Enable auto instrumentation by requiring this module using the [--require flag][require-url]:

```shell
node --require '@opentelemetry/auto-instrumentations-node/register' app.js
```

If your Node application is encapsulated in a complex run script, you can also set it via an environment variable before running Node.

```shell
env NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"
```

The module is highly configurable using environment variables.
Many aspects of the auto instrumentation's behavior can be configured for your needs, such as resource detectors, exporter choice, exporter configuration, trace context propagation headers, and much more.
Instrumentation configuration is not yet supported through environment variables. Users that require instrumentation configuration must initialize OpenTelemetry programmatically.

```shell
export OTEL_TRACES_EXPORTER="otlp"
export OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"
export OTEL_EXPORTER_OTLP_COMPRESSION="gzip"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="https://your-endpoint"
export OTEL_EXPORTER_OTLP_HEADERS="x-api-key=your-api-key"
export OTEL_EXPORTER_OTLP_TRACES_HEADERS="x-api-key=your-api-key"
export OTEL_RESOURCE_ATTRIBUTES="service.namespace=my-namespace"
export OTEL_NODE_RESOURCE_DETECTORS="env,host,os,serviceinstance"
export OTEL_SERVICE_NAME="client"
export NODE_OPTIONS="--require @opentelemetry/auto-instrumentations-node/register"
node app.js
```

By default, all SDK resource detectors are used, but you can use the environment variable OTEL_NODE_RESOURCE_DETECTORS to enable only certain detectors, or completely disable them:

- `env`
- `host`
- `os`
- `process`
- `serviceinstance`
- `container`
- `alibaba`
- `aws`
- `azure`
- `gcp`
- `all` - enable all resource detectors
- `none` - disable resource detection

For example, to enable only the `env`, `host` detectors:

```shell
export OTEL_NODE_RESOURCE_DETECTORS="env,host"
```

By default, all [Supported Instrumentations](#supported-instrumentations) are enabled,
but you can use the environment variable `OTEL_NODE_ENABLED_INSTRUMENTATIONS` to enable only certain instrumentations
by providing a comma-separated list of the instrumentation package names without the `@opentelemetry/instrumentation-` prefix.

For example, to enable only
[@opentelemetry/instrumentation-http](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation-http)
and [@opentelemetry/instrumentation-nestjs-core](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-nestjs-core)
instrumentations:

```shell
export OTEL_NODE_ENABLED_INSTRUMENTATIONS="http,nestjs-core"
```

To enable logging for troubleshooting, set the log level by setting the `OTEL_LOG_LEVEL` environment variable to one of the following:

- `none`
- `error`
- `warn`
- `info`
- `debug`
- `verbose`
- `all`

The default level is `info`.

Notes:

- In a production environment, it is recommended to set `OTEL_LOG_LEVEL`to `info`.
- Logs are always sent to console, no matter the environment, or debug level.
- Debug logs are extremely verbose. Enable debug logging only when needed. Debug logging negatively impacts the performance of your application.

## Usage: Instrumentation Initialization

OpenTelemetry Meta Packages for Node automatically loads instrumentations for Node builtin modules and common packages.

Custom configuration for each of the instrumentations can be passed to the function, by providing an object with the name of the instrumentation as a key, and its configuration as the value.

```javascript
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const exporter = new CollectorTraceExporter();
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'basic-service',
  }),
});
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

registerInstrumentations({
  instrumentations: [
    getNodeAutoInstrumentations({
      // load custom configuration for http instrumentation
      '@opentelemetry/instrumentation-http': {
        applyCustomAttributesOnSpan: (span) => {
          span.setAttribute('foo2', 'bar2');
        },
      },
    }),
  ],
});

```

## Supported instrumentations

- [@opentelemetry/instrumentation-amqplib](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-amqplib-v0.37.0/plugins/node/instrumentation-amqplib)
  - [`amqplib`](https://www.npmjs.com/package/amqplib) versions `>=0.5.5 <1`
- [@opentelemetry/instrumentation-aws-lambda](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-aws-lambda-v0.41.0/plugins/node/opentelemetry-instrumentation-aws-lambda)
  - This package will instrument the lambda execution regardless of versions.
- [@opentelemetry/instrumentation-aws-sdk](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-aws-sdk-v0.41.0/plugins/node/opentelemetry-instrumentation-aws-sdk)
  - [`aws-sdk`](https://www.npmjs.com/package/aws-sdk) versions `>=2.308.0 <3`
  - `@aws-sdk/client-*` versions `>=3.0.0 <4`
- [@opentelemetry/instrumentation-bunyan](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-bunyan-v0.38.0/plugins/node/opentelemetry-instrumentation-bunyan)
  - [`bunyan`](https://www.npmjs.com/package/bunyan) versions `^1.0.0`
- [@opentelemetry/instrumentation-cassandra-driver](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-cassandra-driver-v0.38.0/plugins/node/opentelemetry-instrumentation-cassandra)
  - [`cassandra-driver`](https://www.npmjs.com/package/cassandra-driver) versions `>=4.4 <5.0`
- [@opentelemetry/instrumentation-connect](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-connect-v0.36.0/plugins/node/opentelemetry-instrumentation-connect)
  - [`connect`](https://github.com/senchalabs/connect) versions `^3.0.0`
- [@opentelemetry/instrumentation-cucumber](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-cucumber-v0.6.0/plugins/node/instrumentation-cucumber)
  - [`@cucumber/cucumber`](https://www.npmjs.com/package/@cucumber/cucumber) versions `>=8.0.0 <11`
- [@opentelemetry/instrumentation-dataloader](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-dataloader-v0.9.0/plugins/node/instrumentation-dataloader)
  - [`dataloader`](https://www.npmjs.com/package/dataloader) versions `^2.0.0`
- [@opentelemetry/instrumentation-dns](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-dns-v0.36.1/plugins/node/opentelemetry-instrumentation-dns)
  - Nodejs `>=14`
- [@opentelemetry/instrumentation-express](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-express-v0.38.0/plugins/node/opentelemetry-instrumentation-express)
  - [`express`](https://www.npmjs.com/package/express) version `^4.0.0`
- [@opentelemetry/instrumentation-fastify](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-fastify-v0.36.1/plugins/node/opentelemetry-instrumentation-fastify)
  - [`fastify`](https://www.npmjs.com/package/fastify) versions `>=3.0.0 <5`
- [@opentelemetry/instrumentation-fs](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-fs-v0.12.0/plugins/node/instrumentation-fs)
  - Nodejs `>=14`
- [@opentelemetry/instrumentation-generic-pool](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-generic-pool-v0.36.0/plugins/node/opentelemetry-instrumentation-generic-pool)
  - [`generic-pool`](https://www.npmjs.com/package/generic-pool) version `^3.0.0`
- [@opentelemetry/instrumentation-graphql](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-graphql-v0.40.0/plugins/node/opentelemetry-instrumentation-graphql)
  - [`graphql`](https://www.npmjs.com/package/graphql) versions `'>=14.0.0 <17'`
- [@opentelemetry/instrumentation-grpc](https://github.com/open-telemetry/opentelemetry-js/tree/experimental/v0.51.0/experimental/packages/opentelemetry-instrumentation-grpc)
- [@opentelemetry/instrumentation-hapi](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-hapi-v0.38.0/plugins/node/opentelemetry-instrumentation-hapi)
  - [`@hapi/hapi`](https://www.npmjs.com/package/@hapi/hapi) versions `>=17.0.0 <22`
- [@opentelemetry/instrumentation-http](https://github.com/open-telemetry/opentelemetry-js/tree/experimental/v0.51.0/experimental/packages/opentelemetry-instrumentation-http)
- [@opentelemetry/instrumentation-ioredis](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-ioredis-v0.40.0/plugins/node/opentelemetry-instrumentation-ioredis)
  - [`ioredis`](https://www.npmjs.com/package/ioredis) versions `>=2.0.0 <6`
- [@opentelemetry/instrumentation-knex](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-knex-v0.36.1/plugins/node/opentelemetry-instrumentation-knex)
  - [`knex`](https://www.npmjs.com/package/knex) versions `>=0.10.0 <4`
- [@opentelemetry/instrumentation-koa](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-koa-v0.40.0/plugins/node/opentelemetry-instrumentation-koa)
  - [`koa`](https://www.npmjs.com/package/koa) versions `^2.0.0`
  - [`@koa/router`] versions `>=8.0.0`
- [@opentelemetry/instrumentation-lru-memoizer](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-lru-memoizer-v0.37.0/plugins/node/instrumentation-lru-memoizer)
  - [`lru-memorizer`](https://github.com/jfromaniello/lru-memoizer) versions `>=1.3 <3`
- [@opentelemetry/instrumentation-memcached](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-memcached-v0.36.0/plugins/node/opentelemetry-instrumentation-memcached)
  - [`memcached`](https://www.npmjs.com/package/memcached) versions `>=2.2.0 <3`
- [@opentelemetry/instrumentation-mongodb](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-mongodb-v0.43.0/plugins/node/opentelemetry-instrumentation-mongodb)
  - [`mongodb`](https://www.npmjs.com/package/mongodb) version `>=3.3 <7`
- [@opentelemetry/instrumentation-mongoose](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-mongoose-v0.38.1/plugins/node/instrumentation-mongoose)
  - [`mongoose`](https://www.npmjs.com/package/mongoose) versions `>=5.9.7 <7`
- [@opentelemetry/instrumentation-mysql2](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-mysql2-v0.38.1/plugins/node/opentelemetry-instrumentation-mysql2)
  - [`mysql2`](https://www.npmjs.com/package/mysql2) versions `>=1.4.2 <4`
- [@opentelemetry/instrumentation-mysql](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-mysql-v0.38.1/plugins/node/opentelemetry-instrumentation-mysql)
  - [`mysql`](https://www.npmjs.com/package/mysql) versions `^2.0.0`
- [@opentelemetry/instrumentation-nestjs-core](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-nestjs-core-v0.37.1/plugins/node/opentelemetry-instrumentation-nestjs-core)
  - [`@nestjs/core`](https://www.npmjs.com/package/@nestjs/core) versions `>=4.0.0 <11`
- [@opentelemetry/instrumentation-net](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-net-v0.36.0/plugins/node/opentelemetry-instrumentation-net)
  - Nodejs `>=14`
- [@opentelemetry/instrumentation-pg](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-pg-v0.41.0/plugins/node/opentelemetry-instrumentation-pg)
  - [`pg`](https://www.npmjs.com/package/pg) versions `^8.0.0`
  - [`pg-pool`](https://www.npmjs.com/package/pg-pool) versions `>=2.0.0 <4`
- [@opentelemetry/instrumentation-pino](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-pino-v0.39.0/plugins/node/opentelemetry-instrumentation-pino)
  - [`pino`](https://www.npmjs.com/package/pino) versions `>=5.14.0 <10`
- [@opentelemetry/instrumentation-redis](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-redis-v0.39.1/plugins/node/opentelemetry-instrumentation-redis)
  - [`redis`](https://www.npmjs.com/package/redis) versions `>=2.6.0 <4`
- [@opentelemetry/instrumentation-redis-4](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-redis-4-v0.39.0/plugins/node/opentelemetry-instrumentation-redis-4)
  - [`redis`](https://www.npmjs.com/package/redis) versions `>=4.0.0`
- [@opentelemetry/instrumentation-restify](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-restify-v0.38.0/plugins/node/opentelemetry-instrumentation-restify)
  - [`restify`](https://www.npmjs.com/package/restify) versions `>=4.0.0 <12`
- [@opentelemetry/instrumentation-router](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-router-v0.37.0/plugins/node/opentelemetry-instrumentation-router)
  - [`router`](https://www.npmjs.com/package/route) versions `>=1.0.0 <2`
- [@opentelemetry/instrumentation-socket.io](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-socket.io-v0.39.0/plugins/node/instrumentation-socket.io)
  - [socket.io](https://www.npmjs.com/package/socket.io) versions `>=2 <5`
- [@opentelemetry/instrumentation-tedious](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-tedious-v0.10.1/plugins/node/instrumentation-tedious)
  - [tedious](https://www.npmjs.com/package/tedious) `>=1.11.0 <16`
- [@opentelemetry/instrumentation-undici](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-undici-v0.2.0/plugins/node/instrumentation-undici)
  - [`undici`](https://www.npmjs.com/package/undici) version `>=5.12.0`
- [@opentelemetry/instrumentation-winston](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/instrumentation-winston-v0.37.0/plugins/node/opentelemetry-instrumentation-winston)
  - [`winston`](https://www.npmjs.com/package/winston) versions `>=1.0.0 <4`
  
  Log sending: [`winston`](https://www.npmjs.com/package/winston) versions `>=3.0.0 <4`

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
