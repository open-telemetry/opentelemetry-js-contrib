# OpenTelemetry LangChain Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for framework-owned operations in
[`langchain`](https://www.npmjs.com/package/langchain) and
[`@langchain/core`](https://www.npmjs.com/package/@langchain/core).

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-langchain
```

## Supported Versions

- [`langchain`](https://www.npmjs.com/package/langchain) versions >= `1.0.0` and < `2`
- [`@langchain/core`](https://www.npmjs.com/package/@langchain/core) versions >= `1.0.0` and < `2`

The instrumented SDK must also support the application's Node.js version.
LangChain 1.x requires Node.js 20 or later; the SDK integration tests and
version matrix run only on those runtimes.

## Usage

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const {
  LangChainInstrumentation,
} = require('@opentelemetry/instrumentation-langchain');

const sdk = new NodeSDK({
  instrumentations: [
    new LangChainInstrumentation({
      // Configuration options
      captureMessageContent: false, // Set to true to capture prompt/completion content
    }),
  ],
});
sdk.start();
process.once('beforeExit', async () => {
  await sdk.shutdown();
});
```

Register the instrumentation **before loading LangChain**. For ESM applications,
also load the OpenTelemetry instrumentation hook:

```sh
node --experimental-loader=@opentelemetry/instrumentation/hook.mjs --import ./instrumentation.mjs app.mjs
```

`instrumentation.mjs` should configure the SDK as above using ESM imports.
This package retains its existing experimental/private workspace status and is
not included in `getNodeAutoInstrumentations()`.

## Instrumented operations

| Public boundary                                                                             | Operation         | Span kind  |
| ------------------------------------------------------------------------------------------- | ----------------- | ---------- |
| `RunnableSequence.invoke`, `RunnableSequence.batch`, `RunnableSequence.stream`              | `invoke_workflow` | `INTERNAL` |
| `RunnableMap.invoke`, `RunnableMap.stream`                                                  | `invoke_workflow` | `INTERNAL` |
| `createAgent(...).invoke`, `createAgent(...).stream`                                        | `invoke_agent`    | `INTERNAL` |
| `StructuredTool.invoke`, legacy `StructuredTool.call`, including `tool()` and dynamic tools | `execute_tool`    | `INTERNAL` |

A sequence batch is one workflow invocation spanning the SDK's optimized batch,
not a replacement loop over `invoke`. Workflow names come from `runName`, the
runnable's configured name, or its SDK name. Agent names come from `createAgent`
options. LangGraph's internal sequences marked `omitSequenceTags` are excluded;
so is the early 1.x agent's `model_request` adapter beginning with its
`prompt`-configured runnable. Application-defined nested sequences are retained.

Standalone lambdas, prompt templates and output parsers are not workflows.
Direct LangGraph graph entry points are outside this package's module scope.
Model inference, embeddings and provider-backed retrieval belong to the
underlying SDK instrumentations: this package deliberately does not duplicate
their spans, token attributes or client metrics.

Agent spans do summarize the actual model calls made during that invocation:
available input/output token counts are summed and finish reasons are collected
through the public callback API. Previously checkpointed message history is not
counted. User callback arrays/managers are copied rather than mutated, and no
additional inference spans or metrics are emitted. Callbacks inherited from
enclosing runnables are preserved. Usage collection completes before the span
ends without changing background scheduling for user callbacks.

Operations run with their span active, so application callbacks and underlying
SDK spans retain parentage. Enabling or disabling the instrumentation reapplies
or removes patches from every observed module copy, including nested dependencies
loaded while instrumentation was disabled.
Streams retain the SDK's `ReadableStream` and async
iterator interfaces. Spans end on completion, failure or consumer cancellation;
partial/cancelled streams do not claim a complete output. Exceptions are
preserved, with `error.type` set to the exception name (or `_OTHER` for non-Error
throws). Exception messages and stack traces are not captured.
Internal model streams do not finish the enclosing operation span. Agent output
capture understands `updates`, `values`, `messages`, and combined stream modes,
including final responses from `returnDirect` tools.
Native `pipeTo`, `pipeThrough`, and `tee` consumption retains lifecycle tracing,
but omits output content because native pipelines bypass public chunk reads and
may transform or discard data. Direct iterator and reader consumption captures
output using the runnable's aggregation semantics.
SSE-encoded agent streams also retain lifecycle tracing, but omit encoded output
content. The internal LangGraph encoding adapter is observed only to preserve
the source association; standalone LangGraph operations are not traced.

## Configuration Options

| Option                  | Type      | Default | Description                            |
| ----------------------- | --------- | ------- | -------------------------------------- |
| `captureMessageContent` | `boolean` | `false` | Capture prompt and completion content. |

The case-insensitive boolean environment variable
`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` overrides the constructor
option. Invalid values are diagnosed and ignored.

Content capture also covers message parts, tool arguments, tool results, system
instructions and tool descriptions. Nothing in those fields is recorded by
default. Arbitrary LangChain metadata, tags, API keys and OpenInference context
attributes are never copied. Application-supplied conversation identifiers map
to `gen_ai.conversation.id`: configurable `thread_id`, `session_id`, then
`conversation_id` take precedence over metadata `session_id`, `thread_id`, then
`conversation_id`. Only these explicitly recognized metadata values are read.

Captured messages use the official JSON message schema. Unmapped provider-specific
parts retain their original type and structure instead of being silently dropped.
Inline base64 image data URLs are represented as blob parts with their MIME type;
external image URLs remain URI parts.
Tool arguments/results are JSON objects; scalar or array values are represented
as `{ "content": value }` to satisfy the official tool content schemas.

## Semantic Conventions

This package implements the experimental [GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai/tree/c88d504ab3d9879f8e50d3cc87e69775e11db234/docs/gen-ai)
at commit `c88d504ab3d9879f8e50d3cc87e69775e11db234`.
The GenAI registry does not yet have tagged releases. Unstable constants are
copied locally; runtime code does not import incubating semantic conventions.

See [conformance scenarios](test/conformance/README.md) for deterministic
public-SDK checks using the upstream Weaver conformance runner.

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
