# OpenTelemetry Meta Packages for Node

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-url]

This module provides a simple way to initialize multiple Node instrumentations.

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

- [@opentelemetry/instrumentation-dns](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-dns)
- [@opentelemetry/instrumentation-http](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation-http)
- [@opentelemetry/instrumentation-grpc](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation-grpc)
- [@opentelemetry/instrumentation-express](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-express)
- [@opentelemetry/instrumentation-koa](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-koa)
- [@opentelemetry/instrumentation-graphql](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-graphql)
- [@opentelemetry/instrumentation-ioredis](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-ioredis)
- [@opentelemetry/instrumentation-redis](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-redis)
- [@opentelemetry/instrumentation-pg](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-pg)
- [@opentelemetry/instrumentation-mongodb](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-mongodb)
- [@opentelemetry/instrumentation-mysql](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node/opentelemetry-instrumentation-mysql)

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=metapackages%2Fauto-instrumentations-node
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=metapackages%2Fauto-instrumentations-node
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=metapackages%2Fauto-instrumentations-node&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=metapackages%2Fauto-instrumentations-node&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fauto-instrumentations-node.svg
