# OpenTelemetry GenAI Utilities

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

> [!NOTE]
> This package is under active development, all functionality and features listed here may not be immediately available.

This package provides shared utilities, data models, invocation lifecycle handlers, stream wrappers, and semantic convention constants for Generative AI (GenAI) instrumentation packages in OpenTelemetry JavaScript.

It is the TypeScript / JavaScript equivalent of [`opentelemetry-util-genai`](https://github.com/open-telemetry/opentelemetry-python-genai/tree/main/util/opentelemetry-util-genai) in Python and aligns with the latest [OpenTelemetry GenAI Semantic Conventions](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/README.md).

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/genai-util
```

## Features

- **Semantic Conventions**: Complete constants and enumerations for OpenTelemetry GenAI semantic conventions (attributes, operation names, providers, finish reasons, token modalities, metrics, events).
- **TelemetryHandler**: Central lifecycle façade managing spans, metrics, and events for LLM and GenAI operations.
- **Invocations Lifecycle**: Structured handlers for all GenAI operations:
  - `InferenceInvocation`: Chat completions, text completions, and multimodal content generation (`chat`, `text_completion`, `generate_content`).
  - `AgentInvocation`: Agent / assistant invocations with support for both local in-process agents (`SpanKind.INTERNAL`) and remote agents (`SpanKind.CLIENT`).
  - `EmbeddingInvocation`: Text and multimodal embedding generation (`embeddings`).
  - `ToolInvocation`: Tool / function execution (`execute_tool`).
  - `WorkflowInvocation`: Multi-step AI workflows and pipelines (`invoke_workflow`).
  - `RetrievalInvocation`: RAG vector database lookups and document retrieval (`retrieval`).
  - `FetchResponseInvocation`: Asynchronous response polling and retrieval (`fetch_response`).
- **Streaming Telemetry & TTFT (`wrapAsyncStream`)**:
  - Transparently proxies SDK stream objects via ES6 Proxy.
  - Implements the `AsyncIterable` protocol for clean `for await (const chunk of stream)` consumption.
  - Records **Time To First Chunk (TTFT)** (`gen_ai.client.operation.time_to_first_chunk`), sets `gen_ai.response.time_to_first_chunk`, and sets `gen_ai.request.stream = true` on the first chunk.
  - Supports per-chunk callbacks (`onChunk`), completion hooks (`onEnd`), error handling (`onError`), and early iterator break (`return()`).
  - Automatically finalizes spans and computes overall duration metrics.
- **Metrics Helpers**: Pre-configured histograms (with standard explicit bucket boundaries) and counters:
  - `gen_ai.client.operation.duration` (in seconds)
  - `gen_ai.client.inference.operation.input_tokens` / `output_tokens` (per-operation token histograms)
  - `gen_ai.client.inference.usage.*` (input, output, cache read / write input and reasoning output token counters, split by `gen_ai.token.modality`)
  - `gen_ai.client.operation.time_to_first_chunk` (in seconds)
  - `gen_ai.client.operation.time_per_output_chunk` (in seconds)
  - `gen_ai.execute_tool.duration` (in seconds)
  - `gen_ai.invoke_workflow.duration` (in seconds)
- **Content Capturing & Privacy**: Flexible message content capturing modes (`none`, `span_only`) configurable in code or via environment variables.

---

## Usage Examples

`TelemetryHandler` is exported for instrumentation integrations. Use its
`startTool` factory to create a `ToolInvocation` rather than constructing one
directly. The invocation type is also exported for type annotations.
`ATTR_GEN_AI_TOOL_CALL_ID` is also exported for integrations that need to set
the tool-call ID after starting an invocation.

```typescript
import { TelemetryHandler } from '@opentelemetry/genai-util';

const handler = new TelemetryHandler({
  instrumentationName: '@opentelemetry/instrumentation-example',
  instrumentationVersion: '1.0.0',
  contentCaptureMode: 'none',
});
const invocation = handler.startTool({ toolName: 'lookup' });
try {
  const result = invocation.withContext(() => lookup());
  invocation.setResult(result);
  invocation.stop();
} catch (error) {
  invocation.fail({ exception: error instanceof Error ? error : undefined });
  throw error;
}
```

Callback-based integrations can keep the invocation until the SDK reports
success or failure. Pass its `getContext()` as a child's `parentContext` to
preserve explicit callback parentage without requiring an active context manager.

### Workflow invocations

Use `TelemetryHandler.startWorkflow` for an in-process GenAI workflow. The
`WorkflowInvocation` and `WorkflowInvocationOptions` types are exported;
the invocation constructor is not.

```typescript
const workflow = handler.startWorkflow({
  workflowName: 'support',
  conversationId: 'conversation-1',
});
try {
  await workflow.withContext(() => runWorkflow());
  workflow.stop();
} catch (error) {
  workflow.fail({ exception: error instanceof Error ? error : undefined });
  throw error;
}
```

This creates an `INTERNAL` `invoke_workflow support` span and records
`gen_ai.invoke_workflow.duration` in seconds with the same duration as the span.
Use an application-defined, low-cardinality name, not a class name or run ID.
Names are trimmed; when absent or blank, the span name is `invoke_workflow`
and the workflow-name attribute is omitted from spans and metrics.
Conversation IDs are recorded only on spans. Default metric dimensions are
the workflow name when available and `error.type` on failure; no inference
or token-usage metrics are emitted.

With `contentCaptureMode: 'span_only'`, pass normalized messages through
`inputMessages`, `setInputMessages`, and `setOutputMessages`. They use the same
role/part models and binary serialization as inference invocations. Message
setters replace the previous SDK snapshot rather than append messages. Supply
the final inputs and outputs reported by the SDK when its run ends; the utility
serializes them once at completion, including any outputs the SDK reports on
failure. Passing `undefined` clears an earlier snapshot. With capture disabled,
these message APIs do not retain or serialize content. Serialization failures omit the affected
attribute and produce a content-free diagnostic. Custom span and metric
attributes remain caller-controlled and must not be used to bypass privacy
controls or add high-cardinality metric dimensions.

The caller owns SDK-specific state normalization, callback registration,
suppression checks, and completion. Use SDK-provided run data rather than
reconstructing workflow output by consuming its stream. This utility does not
patch SDKs, consume streams, synthesize graph-state attributes, or implement
cancellation. `withContext` activates the workflow while application code runs;
`getContext()` also supports explicit callback parentage. Repeated `stop()` or
`fail()` calls do not emit another span or duration. Failures record an error
type and ERROR status, without copying exception messages, stacks, or events.
Supply `statusDescription` only when it is known to be content-free.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/genai-util
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fgenai-util.svg
