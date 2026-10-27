# OpenTelemetry LangChain Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for composed workflows and tool execution in
[`@langchain/core`](https://www.npmjs.com/package/@langchain/core).

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-langchain
```

## Supported Versions

- [`@langchain/core`](https://www.npmjs.com/package/@langchain/core) versions `>=1.0.0 <2`

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

This layer does **not** instrument workflow `stream` or `transform`, agents,
LangGraph operations or retrieval. Internal graph adapter sequences are excluded.
Streaming methods retain their original behavior without workflow stream telemetry.
Provider inference remains the responsibility of provider-specific instrumentation.
Workflows emit spans and the `gen_ai.invoke_workflow.duration` histogram in
seconds, not `gen_ai.client.*` metrics or content events. Each completed
instrumented operation records one duration, with `gen_ai.workflow.name` when
available and `error.type` on failure. Prompt/completion content and conversation
IDs are not included in metric attributes.

Span names use the effective SDK `runName`, falling back to the runnable's
explicit `name`. Only non-blank strings are used. The instrumentation does not
call `getName()`. If neither name is available, the span name is `invoke_workflow`
and `gen_ai.workflow.name` is omitted. Otherwise, the span name is
`invoke_workflow {name}` and `gen_ai.workflow.name` contains that same name.
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

### Tool execution

Tool execution uses the donated OpenInference package's callback-manager
integration and tool start/end/error lifecycle. The callbacks delegate to
`@opentelemetry/genai-util`'s `TelemetryHandler.startTool`, `setResult`, `stop`
and `fail` APIs for spans, attributes, content capture and duration metrics.
Only SDK value normalization, callback registration, parentage and context
propagation remain LangChain-specific. This adds `INTERNAL`
`execute_tool {name}` spans for SDK tool callbacks, including `tool`,
`DynamicTool` and `DynamicStructuredTool`. The concrete `_call` implementation,
including custom tool subclasses, runs with the tool span active so spans created
inside the tool nest beneath it across asynchronous work. The execution wrapper
does not replace returned Promises or results; callbacks still own the span
lifecycle.

```js
const { tool } = require('@langchain/core/tools');

const echo = tool(async value => value, {
  name: 'echo',
  description: 'Return the supplied text',
});
await echo.invoke('hello');
```

The tool name uses the callback's serialized name when available, otherwise its
run name, then its serialized class ID. Descriptions are included only when
the callback exposes them. Known dynamic function tools include
`gen_ai.tool.type=function`. Tool-call IDs come from the start callback, or
from the final ToolMessage on early 1.x releases. Available IDs and the first non-empty
`metadata.session_id`, `metadata.thread_id` or `metadata.conversation_id` are
recorded without copying arbitrary metadata.

`captureMessageContent: 'span_only'` also enables `gen_ai.tool.call.arguments`
and `gen_ai.tool.call.result`. Argument strings are JSON-decoded when possible,
preserving scalar and array types inside `{"input": value}`. Plain-text arguments
retain their text. JSON-object result strings are decoded, while other result
strings remain strings. Non-object results are wrapped as `{"output": value}`
to satisfy the official object schemas. SDK result objects, including ToolMessage
envelopes, retain their serialized structure. The object-shape check is applied after
`toJSON`, so dates and other scalar or array serializations are wrapped too.
Failed executions omit results.

Each tracked tool end/error callback records `gen_ai.execute_tool.duration`
in seconds, matching its span duration. Metric attributes contain the tool
name, known type and error type, never arguments, results or conversation IDs.
No tool events or provider inference metrics are added.

Tool span parentage follows the incoming OpenTelemetry context and inherited
parent invocation identity, with parent-run-ID lookup as a fallback. An inert
callback marker preserves that identity through `getChild()` and manager copies,
so overlapping runs with the same ID keep their children attached to the correct
span. Completed or skipped parent identities do not resolve to a replacement run
with the same ID. Completion callbacks are not inherited. Existing callbacks and
callback collections are preserved. Configuration changes and disablement do
not abandon operations that already emitted a tool-start callback.
Each run's telemetry state is local to its callbacks, with parent identities
linked through a `WeakMap`. Shared bookkeeping is limited to run-ID lookups and
the pending-run count.
Tool diagnostics use the selected instrumentation instance's logger.
In-flight tool operations keep that logger even if the instance is disabled.

This migration follows the SDK callback boundary. Validation failures before
tool-start do not create spans, and completion requires a tool-end/error
notification. It does not add a cancellation protocol or iterator observation
to compensate for missing SDK notifications. Pending tool state is capped at
1,000 runs across CJS/ESM copies and instrumentation instances. At capacity,
new tool runs execute normally but do not start tool spans or record tool
duration metrics, and a content-free warning is logged. Already tracked runs
keep their spans and record their actual completion, including results or
errors and duration metrics. Tracking resumes for new runs when an observed
end/error callback frees a slot. Missing completion callbacks continue to occupy
slots, so tracing new tool runs remains paused if all 1,000 slots stay occupied.
Each invocation has its own callback-local state, so completion callbacks for
skipped runs are ignored even if their run IDs or callback managers are reused.
Runnable `.asTool()` adapters
that emit only chain callbacks do not gain tool spans from this slice.

## Configuration Options

| Option                  | Type      | Default | Description                            |
|-------------------------|-----------|---------|----------------------------------------|
| `captureMessageContent` | `'span_only' \| 'none'` | `'none'` | Capture workflow messages and tool arguments/results on spans, or disable capture. |

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
Config/provider updates apply to future invocations. In-flight invocations finish
with their original span, content setting and duration histogram. Disabling
instrumentation does not abandon in-flight spans or duration recordings.
`setMeterProvider` configures the provider used for workflow and tool duration
metrics. Tool invocations use the same configured providers through the shared
GenAI telemetry handler, with its GenAI schema URL.

Multiple instrumentation instances share one workflow wrapper per method.
The most recently enabled instance supplies configuration and providers, without
duplicating telemetry. Disabling it falls back to another enabled instance.
Original methods are restored only after the last instance is disabled, without
removing wrappers installed by other code. If an outer wrapper prevents cleanup,
the inactive workflow wrapper restores the original method on its next call
after the outer wrapper is removed.

Internal-adapter tracking hooks remain installed while disabled so adapters
created during that time can still be recognized after re-enabling. These hooks
do not emit telemetry and wrap the current method without removing wrappers
installed by other code.

The existing workflow implementation remains unchanged. Its adoption of a
shared workflow API is deferred until that API is ready.

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
`gen_ai.input.messages`, `gen_ai.output.messages`, and
`gen_ai.invoke_workflow.duration`. Their exact provenance is pinned in this
package's `src/semconv.ts`. Stable `error.type` is imported from
`@opentelemetry/semantic-conventions`.

Tool spans additionally use `gen_ai.tool.name`, `gen_ai.tool.description`,
`gen_ai.tool.type`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments`,
`gen_ai.tool.call.result`, and `gen_ai.execute_tool.duration`. These are emitted
by `@opentelemetry/genai-util`. Only the late ToolMessage call-ID mapping needs
a local constant in `src/semconv.ts`.

### Tool conformance

The tool scenarios use the upstream
[semantic-conventions-conformance runner](https://github.com/open-telemetry/semantic-conventions-conformance/tree/main/tools/gen-ai/runner),
not a package-specific validation framework. Install that runner and its
pinned Weaver executable, build this package, then run:

```bash
npm run test:conformance --workspace @opentelemetry/instrumentation-langchain
```

The scenario registry is pinned in `test/conformance/conformance.yaml`.
The scenarios execute real offline tools and export spans and metrics through
OTLP/gRPC to Weaver. They cover capture disabled, capture enabled and execution
failure, and results whose JSON serialization is not an object. Reports are
written under the package's ignored `coverage` directory.
Tool spans and metrics include the shared handler's schema URL, so no missing
schema-URL exception is needed. No provider requests or Docker containers are
needed.

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
