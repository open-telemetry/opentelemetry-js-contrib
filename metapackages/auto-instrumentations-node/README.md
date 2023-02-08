# OpenTelemetry Meta Packages for Node

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-url]

This module provides a simple way to initialize multiple Node instrumentations.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/auto-instrumentations-node
```

## Usage

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

- [@opentelemetry/instrumentation-amqplib](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/instrumentation-amqplib)
- [@opentelemetry/instrumentation-aws-lambda](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-aws-lambda)
- [@opentelemetry/instrumentation-aws-sdk](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-aws-sdk)
- [@opentelemetry/instrumentation-bunyan](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-bunyan)
- [@opentelemetry/instrumentation-cassandra-driver](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-cassandra)
- [@opentelemetry/instrumentation-connect](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-connect)
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
