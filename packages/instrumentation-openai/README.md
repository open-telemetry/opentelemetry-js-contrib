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

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `captureMessageContent` | `'none' \| 'span_only' \| boolean` | `'none'` | Controls whether message contents (prompts, completions, system instructions, tool call arguments, and tool outputs) are recorded on spans (`gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.system_instructions`). Passing `true` is equivalent to `'span_only'`, and `false` is equivalent to `'none'`. When omitted, falls back to the `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` environment variable (`none` or `span_only`). |

## Semantic Conventions

This package leverages `@opentelemetry/genai-util` to emit spans and metrics adhering to the [OpenTelemetry GenAI Semantic Conventions](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/README.md) (`https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev`) across Chat Completions (`chat.completions.create`), Embeddings (`embeddings.create`), and Responses (`responses.create`), including streaming Time To First Chunk (TTFT) and Time Per Output Chunk metrics.

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
