# OpenTelemetry AWS Lambda Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`AWS Lambda`](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html).

This module is currently under active development and not ready for general use.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-dns
```

## Usage

Create a file to initialize the instrumentation, such as `lambda-wrapper.js`.
```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { AwsLambdaInstrumentation } = require('@opentelemetry/instrumentation-awslambda');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new AwsLambdaInstrumentation()
  ],
  tracerProvider: provider,
});
```

In your Lambda function configuration, add or update the `NODE_OPTIONS` environment variable to require the wrapper, e.g.,

`NODE_OPTIONS=--require lambda-wrapper`

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-awslambda
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-awslambda
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-awslambda&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-awslambda&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-awslambda
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-awslambda.svg
