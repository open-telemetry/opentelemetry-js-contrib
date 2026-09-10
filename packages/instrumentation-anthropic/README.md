# OpenTelemetry Anthropic Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides basic automatic instrumentation for the
[`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk)
Anthropic client library. It is adapted from the Apache-2.0 licensed
[OpenInference Anthropic instrumentation](https://github.com/eternalcuriouslearner/donation-openinference/tree/main/js/packages/openinference-instrumentation-anthropic)
and emits OpenTelemetry GenAI semantic conventions.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-anthropic
```

## Supported Versions

- `@anthropic-ai/sdk` versions `>=0.65.0 <1`

## Supported APIs

- `anthropic.messages.create()`
- `anthropic.messages.create({ stream: true })`
- `anthropic.messages.stream()`

The current scaffold creates a client span for each call, records the GenAI
provider, operation, and requested model, and marks failed calls as errors.
Streaming spans end when the stream completes, fails, or is closed early.
Response attributes, tools, metrics, logs, and content capture are intentionally
out of scope.

## Usage

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const {
  AnthropicInstrumentation,
} = require('@opentelemetry/instrumentation-anthropic');

const sdk = new NodeSDK({
  instrumentations: [new AnthropicInstrumentation()],
});
sdk.start();
```

The instrumentation must be initialized before `@anthropic-ai/sdk` is loaded.

## Recording integration tests

The successful `messages.create()` integration test uses `nock.back`, similar
to Python VCR. To create a missing recording:

```bash
ANTHROPIC_API_KEY=your-key \
NOCK_BACK_MODE=record \
npm test -w @opentelemetry/instrumentation-anthropic -- \
  --grep 'creates a span for messages.create'
```

To replace an existing recording, use `NOCK_BACK_MODE=update`. Recording uses
the pinned `claude-haiku-4-5-20251001` model and makes one small API request.
Review the generated JSON under `test/mock-responses/` before committing it.

The two streaming recordings can be created together with:

```bash
ANTHROPIC_API_KEY=your-key \
NOCK_BACK_MODE=record \
npm test -w @opentelemetry/instrumentation-anthropic -- --grep 'stream'
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
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-anthropic
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-anthropic.svg
