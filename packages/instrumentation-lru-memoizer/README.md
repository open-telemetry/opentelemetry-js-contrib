# OpenTelemetry lru-memoizer Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`lru-memoizer`](https://github.com/jfromaniello/lru-memoizer) module.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-lru-memoizer
```

## Supported Versions

- [`lru-memoizer`](https://www.npmjs.com/package/lru-memoizer) versions `>=1.3.0 <4`

## Usage

This instrumentation does not produce any telemetry data. It only bind the caller context to callbacks so downstream operations are recorded with the right context (traceId / parentSpanId / baggage / etc). The `lru-memoizer` package is a dependency for other packages such as [jwks-rsa](https://www.npmjs.com/package/jwks-rsa)

To enable a specific instrumentation, pass it to `registerInstrumentations()`.
This is commonly done via `NodeSDK` for fully setting up all OpenTelemetry SDK components:

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { LruMemoizerInstrumentation } = require('@opentelemetry/instrumentation-lru-memoizer');

const sdk = new NodeSDK({
  instrumentations: [
    new LruMemoizerInstrumentation(),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

## Semantic Conventions

This package does not currently generate any attributes from semantic conventions.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-lru-memoizer
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-lru-memoizer.svg
