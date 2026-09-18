# OpenTelemetry LangChain Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for framework-owned operations in
[`langchain`](https://www.npmjs.com/package/langchain) and
[`@langchain/core`](https://www.npmjs.com/package/@langchain/core), with graph
workflows in `@langchain/langgraph` and in-memory retrieval in
`@langchain/classic`.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-langchain
```

## Supported Versions

- [`langchain`](https://www.npmjs.com/package/langchain) versions >= `1.0.0` and < `2`
- [`@langchain/core`](https://www.npmjs.com/package/@langchain/core) versions >= `1.0.0` and < `2`
- [`@langchain/langgraph`](https://www.npmjs.com/package/@langchain/langgraph) versions >= `1.0.0` and < `2`
- [`@langchain/classic`](https://www.npmjs.com/package/@langchain/classic) versions >= `1.0.0` and < `2`

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

| Public boundary                                                                                                                       | Operation         | Span kind  |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------- |
| `RunnableSequence.invoke`, `RunnableSequence.batch`, `RunnableSequence.stream`                                                        | `invoke_workflow` | `INTERNAL` |
| `RunnableMap.invoke`, `RunnableMap.stream`                                                                                            | `invoke_workflow` | `INTERNAL` |
| `createAgent(...).invoke`, `createAgent(...).stream`                                                                                  | `invoke_agent`    | `INTERNAL` |
| `StructuredTool.invoke`, legacy `StructuredTool.call`, including `tool()` and dynamic tools                                           | `execute_tool`    | `INTERNAL` |
| `RunnableSequence.transform`, `RunnableMap.transform` (including nested streaming steps)                                              | `invoke_workflow` | `INTERNAL` |
| Compiled LangGraph / `Pregel.invoke`, `Pregel.stream`                                                                                 | `invoke_workflow` | `INTERNAL` |
| `MemoryVectorStore.similaritySearch`, `.similaritySearchWithScore`, `.similaritySearchVectorWithScore`, `.maxMarginalRelevanceSearch` | `retrieval`       | `CLIENT`   |

A sequence batch is one workflow invocation spanning the SDK's optimized batch,
not a replacement loop over `invoke`. Workflow names come from `runName`, the
runnable's configured name, or its SDK name. Agent names come from `createAgent`
options. LangGraph's internal sequences marked `omitSequenceTags` are excluded;
so is the early 1.x agent's `model_request` adapter beginning with its
`prompt`-configured runnable. Application-defined nested sequences are retained.

Standalone lambdas, prompt templates and output parsers are not workflows.
Model inference, embeddings and provider-backed retrieval belong to the
underlying SDK instrumentations: this package deliberately does not duplicate
their spans, token attributes or client metrics.

Compiled graph entry points are workflows, including nested application graphs.
The graph implementing a `createAgent` invocation does not create a second span.
Memory vector store retrieval includes `asRetriever().invoke/stream` and retrieval
chains, but only the in-memory implementation is patched, not generic provider
vector stores. Retrieval uses the official `CLIENT` convention even when the
framework executes it in-process. No provider or server address is invented.

Agent spans do summarize the actual model calls made during that invocation:
available input/output token counts are summed and finish reasons are collected
in generation order, including repeated reasons, through the public callback API.
Previously checkpointed message history is not
counted. User callback arrays/managers are copied rather than mutated, and no
additional inference spans or metrics are emitted. Callbacks inherited from
enclosing runnables are preserved. Usage collection completes before the span
ends without changing background scheduling for user callbacks.
Agent descriptions are recorded when available, and structured response formats
set `gen_ai.output.type` to `json`. Agents with model-call middleware omit
`gen_ai.request.model`, since middleware can select or fall back to a different
model than the configured initial model.
When no actual usage object is available, explicit SDK `estimatedTokenUsage`
counts are used as a fallback; the instrumentation does not calculate estimates.
Only nonnegative integral input/output counts are recorded. Total-token and
provider-specific usage-detail fields are not invented on the agent span.

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
the source association.
For graph workflows, `values` stream snapshots expose the final state and are
captured without concatenating successive snapshots. Update-only, custom, debug,
and encoded streams do not expose a complete reduced state, so their output
content is omitted rather than re-executing application reducers. Arbitrary
graph state is not relabelled as a message: capture recognizes strings, messages,
and the `input`, `output`, or `messages` fields. Public transform inputs are
iterators rather than messages and are not serialized; their output is captured
normally. Scoped suppression and child contexts are preserved inside producers.

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
Agent and graph defaults supplied with `withConfig` are honored, with
invocation-time configuration taking precedence according to the SDK.

Captured messages use the official JSON message schema. Unmapped provider-specific
parts retain their original type and structure instead of being silently dropped.
Inline base64 image data URLs are represented as blob parts with their MIME type;
external image URLs remain URI parts.
Tool arguments/results are JSON objects; scalar or array values are represented
as `{ "content": value }` to satisfy the official tool content schemas.
Retrieval query text and document identifiers/scores are also opt-in. Retrieved
document bodies and arbitrary metadata are not copied into invented attributes.
Direct vector queries never export embedding vectors.

## Semantic Conventions

This package implements the experimental [GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai/tree/c88d504ab3d9879f8e50d3cc87e69775e11db234/docs/gen-ai)
at commit `c88d504ab3d9879f8e50d3cc87e69775e11db234`.
The GenAI registry does not yet have tagged releases. Unstable constants are
copied locally; runtime code does not import incubating semantic conventions.

See [conformance scenarios](test/conformance/README.md) for deterministic
public-SDK checks using the upstream Weaver conformance runner.

This migration emits spans, matching the donated signal coverage. It does not
yet emit the separately recommended workflow/agent/tool duration and call-count
metrics, or an owned-retrieval duration metric. Those are additional metric
features, not delegated provider metrics; provider inference metrics remain the
responsibility of the underlying SDK instrumentation.

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
