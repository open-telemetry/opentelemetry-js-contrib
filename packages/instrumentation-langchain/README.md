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

## Configuration Options

| Option                  | Type      | Default | Description                            |
|-------------------------|-----------|---------|----------------------------------------|
| `captureMessageContent` | `boolean` | `false` | Capture prompt and completion content. |

`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true|false` (case-insensitive)
overrides the constructor option. Invalid values are diagnosed and ignored.
The environment is read only at construction: later `setConfig` calls take
precedence, and omitting `captureMessageContent` resets it to `false`.
The boolean setting maps explicitly to the shared utility's `span_only` or
`none` mode. Content can contain sensitive data; enable capture deliberately.

Instrumentation-owned tracer and meter providers are used, including providers
supplied through `setTracerProvider` and `setMeterProvider`. Config/provider updates
apply to future invocations; in-flight invocations finish with their original
lifecycle handler and content setting. Disabling instrumentation does not abandon
in-flight spans.

Failed operations record `error.type` (the error name, or `_OTHER`) and ERROR
status, but never the original error message, stack or exception event, even
when content capture is enabled. SDK errors and returned objects/Promises are
preserved. Extraction failures produce content-free diagnostics and do not
replace application results or failures.

## Content adapters

The internal content adapter normalizes LangChain messages and prompt values
into the shared `@opentelemetry/genai-util` message models. It preserves message
roles, tuple and string-array inputs, tool/function-call envelopes, server-tool
result IDs, reasoning, multimodal content, and unknown provider-specific parts.
Inline image data URLs and SDK multimedia `base64` fields are validated locally
and decoded into raw `Uint8Array` blob content. The shared formatters encode those
bytes as base64 for message and system-instruction attributes. Valid padded and
unpadded inputs preserve the same bytes, not their original encoded spelling.
Invalid encoding (including malformed padding or nonzero unused pad bits) is
omitted with content-free diagnostics; other valid parts remain intact.
Raw binary blob views retain their exact byte range. Unknown provider-specific
parts remain unchanged, but invalid standardized blobs cannot bypass validation
through that fallback.

`parseInputMessages`, `parseOutputMessages`, and `parseSystemInstructions` return
structured models for instrumentation code. The internal `messages` and
`systemInstructions` wrappers serialize those models through the shared public
formatters and diagnose normalization or serialization failures. Empty system
instruction arrays follow the shared formatter's convention and produce no
attribute; string instructions, including empty or JSON-like strings, remain
literal text.

These adapters are not a public LangChain instrumentation API. The workflow
lifecycle uses them only when content capture is enabled. System-instruction
adapters are available internally for later operation-specific instrumentation.

## Semantic Conventions

This package uses the shared GenAI conventions from
[`@opentelemetry/genai-util`](../genai-util/README.md):
`gen_ai.operation.name`, `gen_ai.workflow.name`, `gen_ai.conversation.id`,
`gen_ai.input.messages`, and `gen_ai.output.messages`. The shared conventions
are experimental and pinned in that package's `src/semconv.ts`.

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
