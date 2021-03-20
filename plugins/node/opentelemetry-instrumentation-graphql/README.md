# OpenTelemetry Instrumentation GraphQL

[![Gitter chat][gitter-image]][gitter-url]
[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides *automated instrumentation and tracing* for GraphQL in Node.js applications.

## Installation

```shell script
npm install @opentelemetry/instrumentation-graphql
```

## Usage

```js
'use strict';

const { GraphQLInstrumentation } = require('@opentelemetry/instrumentation-graphql');

const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/tracing');
const { NodeTracerProvider } = require('@opentelemetry/node');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const exporter = new CollectorTraceExporter({
  serviceName: 'basic-service',
});

const provider = new NodeTracerProvider();

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

registerInstrumentations({
  instrumentations: [
    new GraphQLInstrumentation({
    // optional params
      // allowAttributes: true,
      // depth: 2,
      // mergeItems: true,
    }),
  ],
  tracerProvider: provider,
});

```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/open-telemetry/opentelemetry-js.svg
[gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js/status.svg?path=packages/opentelemetry-instrumentation-graphql
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js?path=packages%2Fopentelemetry-instrumentation-graphql
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js/dev-status.svg?path=packages/opentelemetry-instrumentation-graphql
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js?path=packages%2Fopentelemetry-instrumentation-graphql&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-graphql
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-graphql.svg
