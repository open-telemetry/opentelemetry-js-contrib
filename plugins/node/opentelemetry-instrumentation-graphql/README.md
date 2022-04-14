# OpenTelemetry Instrumentation GraphQL

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation and tracing for GraphQL in Node.js applications, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

*Note*: graphql plugin instruments graphql directly. it should work with any package that wraps the graphql package (e.g apollo).

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```shell script
npm install @opentelemetry/instrumentation-graphql
```

### Supported Versions

`>=14 <16`

## Usage

```js
'use strict';

const { GraphQLInstrumentation } = require('@opentelemetry/instrumentation-graphql');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new GraphQLInstrumentation({
    // optional params
      // allowValues: true,
      // depth: 2,
      // mergeItems: true,
    }),
  ],
});

```

## Optional Parameters

|    Param    |   type  | Default Value |                                                                        Description                                                                        |   |
|:-----------:|:-------:|:-------------:|:---------------------------------------------------------------------------------------------------------------------------------------------------------:|:-:|
|  mergeItems | boolean |     false     |                    Whether to merge list items into a single element. example: `users.*.name` instead of `users.0.name`, `users.1.name`                   |   |
|    depth    |  number |       -1      |                       The maximum depth of fields/resolvers to instrument. When set to 0 it will not instrument fields and resolvers. When set to -1 it will instrument all fields and resolvers.                      |   |
| allowValues | boolean |     false     | When set to true it will not remove attributes values from schema source.   By default all values that can be sensitive are removed and replaced with "*" |   |
| responseHook | GraphQLInstrumentationExecutionResponseHook |     undefined     | Hook that allows adding custom span attributes based on the data returned from "execute" GraphQL action. |   |

## Examples

Can be found [here](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/graphql)

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-graphql
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-graphql.svg
