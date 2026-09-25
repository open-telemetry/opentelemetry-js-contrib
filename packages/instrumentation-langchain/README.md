# OpenTelemetry LangChain Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for composed workflows in
[`@langchain/core`](https://www.npmjs.com/package/@langchain/core).

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-langchain
```

## Supported Versions

- [`@langchain/core`](https://www.npmjs.com/package/@langchain/core) versions `>=1.0.0 <2`
- LangChain 1.x requires Node.js 20 or later.

The package test command selects SDK suites before importing them. On Node.js
18 it runs only SDK-independent configuration and module-registration tests and
reports that SDK suites are skipped. On Node.js 20+ it runs the full suite,
including real CommonJS and ESM loading.

## Usage

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { LangChainInstrumentation } = require('@opentelemetry/instrumentation-langchain');

const sdk = new NodeSDK({
  instrumentations: [
    new LangChainInstrumentation({
      // Configuration options
      captureMessageContent: 'none', // Use 'span_only' to capture prompt/completion content
    }),
  ],
});
sdk.start();
process.once('beforeExit', async () => { await sdk.shutdown(); });
```

Load the instrumentation before importing LangChain. CommonJS and ESM copies of
the supported modules are patched independently. ESM applications also need
the OpenTelemetry instrumentation loader, as described in the
[`@opentelemetry/instrumentation` documentation](https://github.com/open-telemetry/opentelemetry-js/blob/main/experimental/packages/opentelemetry-instrumentation/README.md).

After SDK initialization, a composed workflow creates an INTERNAL span:

```js
const { RunnableLambda, RunnableSequence } = require('@langchain/core/runnables');

const greeting = RunnableSequence.from([
  RunnableLambda.from(input => input.toUpperCase()),
  RunnableLambda.from(input => `${input}!`),
]).withConfig({ runName: 'greeting' });

// Creates "invoke_workflow greeting"; returns "HELLO!" unchanged.
await greeting.invoke('hello', { configurable: { thread_id: 'conversation-1' } });
```

## Instrumented operations

`RunnableSequence.invoke` and `RunnableMap.invoke` create `invoke_workflow`
spans. `RunnableSequence.batch` creates one span around its optimized batch
implementation; `RunnableMap.batch` delegates to independently traced invocations
for each input. Nested and recursive composed workflows remain distinct spans.
Standalone lambdas, prompts, parsers and model calls are not patched.
Batch output is normalized one result at a time, in result order: generated
strings are assistant messages, while explicit SDK roles and nested message
histories retain their roles. Input string-message shorthand remains user content.

This layer does **not** instrument `stream` or `transform`, tools, agents,
LangGraph operations or retrieval. Internal graph adapter sequences are excluded.
Streaming methods retain their original behavior without workflow stream telemetry.
Provider inference remains the responsibility of provider-specific instrumentation.
Workflows emit spans only, not `gen_ai.client.*` metrics or content events.

Span names use the effective SDK `runName`, runnable name, or `getName()`.
`gen_ai.conversation.id` uses the first non-empty string from
`configurable.thread_id`, `configurable.session_id`,
`configurable.conversation_id`, `metadata.session_id`, `metadata.thread_id`,
then `metadata.conversation_id`. Arbitrary metadata is never copied.
The SDK applies `withConfig` defaults before the instrumented invocation;
per-input batch configurations are left unchanged, without inventing one shared
conversation ID or name for the entire batch.
Configuration observation reads only own data properties. Accessor-backed
`runName`, `metadata`, `configurable` and conversation aliases are omitted with
content-free diagnostics, without invoking getters or changing SDK options.

## Configuration Options

| Option                  | Type      | Default | Description                            |
|-------------------------|-----------|---------|----------------------------------------|
| `captureMessageContent` | `'span_only' \| 'none'` | `'none'` | Capture prompt and completion content on spans, or disable capture. |

`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=span_only|none` overrides the
constructor option. Environment values are trimmed and case-insensitive; unset,
empty or whitespace-only values leave the constructor option in effect. The
environment is read only at construction: later `setConfig` calls take precedence,
and omitting `captureMessageContent` resets it to `'none'`.

The option accepts only the canonical strings `'span_only'` and `'none'`.
Booleans and boolean-like strings (`true`/`false`), aliases, and other invalid
values are not supported. Invalid configuration or non-empty environment
overrides produce content-free warnings and disable capture, even when the
previous or constructor setting enabled it. This replaces the earlier
experimental boolean option. Content can contain sensitive data; enable capture
deliberately.

Workflow spans use the standard OpenTelemetry tracer, span and context APIs
directly, with the instrumentation-owned tracer (including `setTracerProvider`).
Config/provider updates apply to future invocations; in-flight invocations finish
with their original span and content setting. Disabling instrumentation does not
abandon in-flight spans. `setMeterProvider` remains supported by the instrumentation
base, but workflows do not create metric instruments or record client metrics.

This workflow-only phase intentionally does not depend on `@opentelemetry/genai-util`.
Adoption of its concrete workflow API is deferred to a follow-up once that API is
ready. Public GenAI utility exports and system-instruction handling are outside
the scope of this phase.

Failed operations record `error.type` (the error name, or `_OTHER`) and ERROR
status, but never the original error message, stack or exception event, even
when content capture is enabled. SDK errors and returned objects/Promises are
preserved. Extraction failures produce content-free diagnostics and do not
replace application results or failures.

## Content adapters

The internal content adapter normalizes LangChain messages and prompt values
into role/part arrays for the input and output message attributes. It preserves message
roles, tuple and string-array inputs, tool/function-call envelopes, server-tool
result IDs, reasoning, multimodal content, and unknown provider-specific parts.
Inline image data URLs and SDK multimedia `base64` fields are validated locally
and decoded into raw `Uint8Array` blob content. A local JSON serializer encodes those
bytes as base64 for input and output message attributes. Valid padded and
unpadded inputs preserve the same bytes, not their original encoded spelling.
Invalid encoding (including malformed padding or nonzero unused pad bits) is
omitted with content-free diagnostics; other valid parts remain intact.
Raw binary blob views retain their exact byte range. Unknown provider-specific
parts remain unchanged, but invalid standardized blobs cannot bypass validation
through that fallback.
Base64 validation is a linear, constant-space scan without a regexp stack or an
instrumentation-imposed payload-size cap.

`parseInputMessages` and `parseOutputMessages` return structured models for
instrumentation code. The internal `messages` wrapper serializes those arrays
and diagnoses normalization or serialization failures without logging their
contents.

These adapters are not a public LangChain instrumentation API. The workflow
lifecycle uses them only when content capture is enabled.

## Collector regression tests

After building this package and its workspace dependencies, run the opt-in
workflow-only regression harness with Docker available:

```bash
npm run test:collector --workspace @opentelemetry/instrumentation-langchain
```

The harness starts the official Collector Contrib 0.161.0 image pinned by digest
in `test/collector/run.cjs`, exports through OTLP/gRPC, and asserts the actual
Collector file output. It checks configuration getter behavior against disabled
instrumentation, canonical capture modes, invalid/boolean-like settings and
environment precedence, batch roles/order, privacy, errors, active context, and complete
4 MiB synthetic image bytes plus sibling text through both base64 fields and
data URLs. No provider requests are made.

Only loopback ephemeral ports are published. The Collector receiver sets
`max_recv_msg_size_mib: 64`: two full base64 message attributes exceed the default
4 MiB receive limit. Span attributes are not truncated to fit transport limits.
Cases flush serially to avoid the exporter's concurrent-request limit.

Set `OTEL_LANGCHAIN_COLLECTOR_ARTIFACTS` to an existing directory to select the
evidence parent; otherwise the OS temporary directory is used. Each run creates
its own subdirectory. On success, only a concise receipt and Collector logs are
retained; full payload/config files are removed. Failures retain evidence for
diagnosis. The harness stops and removes only its own container on either path.
This is scoped regression proof, not the later full migration conformance suite.

## Semantic Conventions

This package uses the experimental GenAI conventions
`gen_ai.operation.name`, `gen_ai.workflow.name`, `gen_ai.conversation.id`,
`gen_ai.input.messages`, and `gen_ai.output.messages`. Their exact provenance is
pinned in this package's `src/semconv.ts`; stable `error.type` is imported from
`@opentelemetry/semantic-conventions`.

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
