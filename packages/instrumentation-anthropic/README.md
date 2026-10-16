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
provider, operation, and requested model, and marks failed calls as errors. The
provider is derived from the client's base URL, so `AnthropicBedrock` and
`AnthropicVertex` calls are reported as `aws.bedrock` and `gcp.vertex_ai`.
Response attributes, tools, metrics, logs, and content capture are intentionally
out of scope.

The patch is registered on the shared `Messages` resource module rather than on
the package root, in both its CommonJS and ESM builds, so it applies however the
SDK was imported: the package root, the `@anthropic-ai/sdk/client` subpath used
by the Bedrock and Vertex clients, or a native ESM import under the
OpenTelemetry ESM loader.

## Span lifetime

A span covers the caller's operation, not the HTTP exchange, so it ends when
the caller is done rather than when a response first arrives. Each case below
has a test in `test/anthropic.test.ts`.

### Non-streaming calls

`messages.create()` returns an `APIPromise` whose body is parsed lazily, so the
instrumentation never subscribes to it eagerly. Both consumption paths are
wrapped and whichever the caller uses decides the span:

| The caller does | The span ends when | Recorded as |
| --- | --- | --- |
| `await`, `then`, `withResponse()` | the body finishes parsing | the call's outcome |
| `asResponse()` | the response settles | success; the caller owns the body |
| nothing | never; no span is exported | — |

Consequences worth knowing:

- The response body is left unread, so `asResponse()` and `withResponse()`
  still work. Parsing it eagerly would consume it before the caller could.
- Errors raised while reading the body — a truncated or malformed payload, a
  connection reset mid-body — are recorded, not just HTTP status errors.
- A caller that holds the promise and consumes it much later still gets an
  accurate duration, and a failure at that point is still recorded.

### Raw streams

`messages.create({ stream: true })` resolves to a `Stream`. The instrumentation
wraps the stream's internal `iterator()` — which `tee()` and
`Symbol.asyncIterator` both go through — and the span ends with the iteration.

Aborts need care because the SDK aborts its own controller as a control-flow
mechanism, so an aborted signal by itself does not mean the caller cancelled:

| When the abort arrives | Treated as | Why |
| --- | --- | --- |
| while `next()` is outstanding | the iterator's outcome | the SDK aborts this way when an SSE `error` event ends the stream; recording a user abort would discard the real API error |
| while the iterator is suspended | user cancellation | this is the caller's own time, and may be the last thing to happen to the stream |
| delivering a buffered event | user cancellation | `next()` can still resolve with a buffered event after an abort |
| during iterator cleanup | ordinary termination | `return()` aborts the controller itself when the caller breaks out of a loop |
| before any iteration | user cancellation | nothing else would ever end the span |

The SDK swallows abort errors and simply stops yielding, so a completed
iteration is also checked against the signal before being called a success.
Iterator cleanup always runs, whether or not the span has already ended, so the
response body is released exactly as it would be without instrumentation.

### The `messages.stream()` helper

The helper keeps working after the raw stream is exhausted: it accumulates
events into a final message and fails if the response ended before
`message_stop`. The iterator sees a clean completion in that case, so for
helper calls the span's outcome comes from the helper's own terminal promise
instead.

### No span at all

The instrumentation returns the SDK's own value untouched, starting nothing to
clean up, when it is disabled, when tracing is suppressed via
`suppressTracing()`, or when the call is too malformed to instrument — so the
SDK raises its own error for `messages.create()` with no arguments, rather than
the patch failing first.

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

Every HTTP interaction in the suite is replayed from a cassette under
`test/mock-responses/`, using `nock.back` (similar to Python's VCR). Cassettes
come in two kinds:

- **Recorded** from the real API: the successful `messages.create()`,
  `messages.create({ stream: true })` and `messages.stream()` calls. These can
  be re-recorded.
- **Authored by hand** in the same format, for responses the API will not
  produce on demand: a truncated body, an SSE `error` event, a stream that ends
  before `message_stop`, a rate-limited request, and the Bedrock and Vertex
  endpoints. The suite always replays these, even during a recording run, so a
  recording run cannot overwrite them with a successful response.

Tests run against the recorded cassettes with a placeholder key. Only the tests
that build their client with `createRecordingClient()` reach the real API when
recording; the rest are pinned to hand-authored cassettes by design.

To capture a cassette that does not exist yet:

```bash
ANTHROPIC_API_KEY=your-key \
NOCK_BACK_MODE=record \
npm test -w @opentelemetry/instrumentation-anthropic -- \
  --grep 'creates a span for messages.create'
```

`record` only writes cassettes that are missing and replays the ones that
exist. To refresh an existing recording, delete it first, or use
`NOCK_BACK_MODE=update`, which replaces every recorded cassette a run touches:

```bash
ANTHROPIC_API_KEY=your-key \
NOCK_BACK_MODE=update \
npm test -w @opentelemetry/instrumentation-anthropic -- --grep 'messages.stream'
```

Both modes require `ANTHROPIC_API_KEY`; without it the run is refused rather
than replacing good recordings with failed requests. Recording uses the pinned
`claude-haiku-4-5-20251001` model and makes one small request per test. Prefer
`--grep` to re-record a single scenario rather than the whole suite.

Recorded cassettes are sanitized on write — API keys, authorization, cookies,
organization, workspace and tracing identifiers are stripped — but review the
generated JSON under `test/mock-responses/` before committing it.

Two tests do not use a cassette: the span-duration test needs `delayBody`,
which is transfer timing that a recording does not preserve, and the ESM test
runs in a child process against a local stand-in server.

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
