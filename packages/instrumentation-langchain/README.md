# OpenTelemetry LangChain Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`langchain`](https://www.npmjs.com/package/langchain) module.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-langchain
```

## Supported Versions

- [`langchain`](https://www.npmjs.com/package/langchain) versions >= `1.0.0`

## Usage

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { LangChainInstrumentation } = require('@opentelemetry/instrumentation-langchain');

const sdk = new NodeSDK({
  instrumentations: [
    new LangChainInstrumentation({
      // Configuration options
      captureMessageContent: false, // Set to true to capture prompt/completion content
    }),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

## Configuration Options

| Option                  | Type      | Default | Description                            |
|-------------------------|-----------|---------|----------------------------------------|
| `captureMessageContent` | `boolean` | `false` | Capture prompt and completion content. |

## Semantic Conventions

This package implements Semantic Convention [Version 1.38.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.38.0/docs/README.md).

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-langchain
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-langchain.svg
