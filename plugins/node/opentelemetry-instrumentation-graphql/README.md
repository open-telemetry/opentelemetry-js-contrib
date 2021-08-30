# OpenTelemetry Instrumentation GraphQL

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides *automated instrumentation and tracing* for GraphQL in Node.js applications.

*Note*: graphql plugin instruments graphql directly. it should work with any package that wraps the graphql package (e.g apollo).

Minimum required graphql version is `v14`

## Installation

```shell script
npm install @opentelemetry/instrumentation-graphql
```

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
      // allowAttributes: true,
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
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-graphql
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-graphql
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-graphql&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-graphql&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-graphql
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-graphql.svg
