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
| `captureMessageContent` | `'none' \| 'span_only'` | `'none'` | Use `'span_only'` to record messages and system instructions on spans. Text and tool arguments may contain sensitive data. Image, audio, and file input parts omit URL credentials, query strings, fragments, and binary payloads. |

`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` takes precedence over the
option. To migrate from boolean configuration, replace `true` with `span_only`
and `false` with `none`. The old boolean values no longer enable capture.

## Semantic Conventions

Chat Completions, Embeddings, and Responses use `@opentelemetry/genai-util` for
[GenAI spans and metrics](https://opentelemetry.io/docs/specs/semconv/gen-ai/).
The provider is `openai` even when the client uses a custom base URL. Legacy
per-message logs and the old token histogram are no longer emitted. Streaming
spans end when iteration completes, fails, or exits early. A stream that is
never consumed can leave its span open.

The instrumentation does not read or clone the SDK's response body. For
non-streaming calls consumed only through `.asResponse()`, or left unread
until after the response arrives, spans can contain request metadata without
parsed response or usage fields. With `span_only`, audio output is represented
by its modality and available transcript, not the original audio bytes.

To check the three operations against the GenAI semantic conventions, install
the [conformance runner](https://github.com/open-telemetry/semantic-conventions-conformance/tree/main/tools/gen-ai/runner),
its mock server, and its pinned Weaver version. Build the package, then run
`npm run test:conformance -w @opentelemetry/instrumentation-openai`.

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
