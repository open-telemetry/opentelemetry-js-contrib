# OpenTelemetry OpenAI module Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`openai`](https://www.npmjs.com/package/openai) module.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](https://www.npmjs.com/package/@opentelemetry/sdk-node) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-openai
```

## Supported Versions

- [`openai`](https://www.npmjs.com/package/openai) versions `>=4.19.0 <7`

## Usage

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OpenAIInstrumentation } = require('@opentelemetry/instrumentation-openai');

const sdk = new NodeSDK({
  instrumentations: [
    new OpenAIInstrumentation(),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

## Semantic Conventions

This package implements Semantic Convention [Version 1.36.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.36.0/docs/README.md) for Chat Completions, and Semantic Convention [Version 1.38.0](https://github.com/open-telemetry/semantic-conventions/blob/v1.38.0/docs/README.md) for Responses API.

Shared GenAI helpers come from [`@opentelemetry/genai-util`](https://www.npmjs.com/package/@opentelemetry/genai-util). Spans set `gen_ai.provider.name` from the client `baseURL` when the host maps to a known GenAI provider (for example Azure OpenAI); otherwise the value defaults to `openai`.

Message content capture remains **opt-in** (`captureMessageContent: true` or `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`) to avoid exporting prompts or completions by default.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-openai
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-openai.svg
