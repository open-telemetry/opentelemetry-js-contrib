# OpenTelemetry AWS Lambda Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

[component owners](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/.github/component_owners.yml): @willarmiros @NathanielRN

This module provides automatic instrumentation for [`AWS Lambda`](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html).

This module is currently under active development and not ready for general use.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-aws-lambda
```

## Usage

Create a file to initialize the instrumentation, such as `lambda-wrapper.js`.

```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { AwsLambdaInstrumentation } = require('@opentelemetry/instrumentation-aws-lambda');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new AwsLambdaInstrumentation({
        // see under for available configuration
    })
  ],
});
```

In your Lambda function configuration, add or update the `NODE_OPTIONS` environment variable to require the wrapper, e.g.,

`NODE_OPTIONS=--require lambda-wrapper`

## AWS Lambda Instrumentation Options

| Options | Type  | Description |
| --- | --- | --- |
| `requestHook` | `RequestHook` (function) | Hook for adding custom attributes before lambda starts handling the request. Receives params: `span, { event, context }` |
| `responseHook` | `ResponseHook` (function) | Hook for adding custom attributes before lambda returns the response. Receives params: `span, { err?, res? } ` |
| `disableAwsContextPropagation` | `boolean` | By default, this instrumentation will try to read the context from the `_X_AMZN_TRACE_ID` environment variable set by Lambda, set this to `true` to disable this behavior |
| `eventContextExtractor` | `EventContextExtractor` (function) | Function for providing custom context extractor in order to support different event types that are handled by AWS Lambda (e.g., SQS, CloudWatch, Kinesis, API Gateway). Applied only when `disableAwsContextPropagation` is set to `true`. Receives params: `event` |

### Hooks Usage Example

```js
const { AwsLambdaInstrumentation } = require('@opentelemetry/instrumentation-aws-lambda');

new AwsLambdaInstrumentation({
    requestHook: (span, { event, context }) => {
        span.setAttributes('faas.name', context.functionName);
    },
    responseHook: (span, { err, res }) => {
        if (err instanceof Error) span.setAttributes('faas.error', err.message);
        if (res) span.setAttributes('faas.res', res);
    }
})
```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-aws-lambda
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-aws-lambda
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-aws-lambda&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-aws-lambda&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-aws-lambda
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-aws-lambda.svg
