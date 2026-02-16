# OpenTelemetry Neo4j Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`neo4j-driver`](https://github.com/neo4j/neo4j-javascript-driver) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-mysql2
```

## Supported Versions

- [`neo4j-driver`](https://www.npmjs.com/package/neo4j-driver) versions `>=4.0.0 <6`

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { Neo4jInstrumentation } = require('@opentelemetry/instrumentation-neo4j');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new Neo4jInstrumentation(),
    // other instrumentations
  ],
})
```

### Neo4j Instrumentation Options

You can set the following instrumentation options:

| Options        | Type                                   | Description                                                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `responseHook` | `Neo4jResponseCustomAttributesFunction` | Hook called before response is returned, which allows to add custom attributes to span.      |
| `ignoreOrphanedSpans` | `boolean` | Set to true if you only want to trace operation which has parent spans |

## Semantic Conventions



## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-neo4j
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-neo4j.svg
