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
  - Wraps SDK stream objects in-place via `[Symbol.asyncIterator]`, preserving stream identity and `instanceof`.
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
- **Content Capturing & Privacy**: Flexible message content capturing modes (`none`, `span_only`) configurable in code or via environment variables.

---

## Current public exports

This package uses an incremental export policy. The current public surface includes:

- `TelemetryHandler` / `TelemetryHandlerOptions`
- Invocation result types: `InferenceInvocation`, `EmbeddingInvocation`, `ToolInvocation`
- Content capture helpers: `ENV_GENAI_CAPTURE_MESSAGE_CONTENT`, `getContentCaptureMode`, `parseContentCaptureMode`
- `getErrorType`
- GenAI semantic convention constants from `semconv`

Additional APIs (stream wrappers, agent/workflow/retrieval invocations) land as they stabilize. Instrumentations that need a still-private helper should export it from `src/index.ts` in the same PR that adopts it.

### Release-order note

Published npm `@opentelemetry/genai-util@0.4.0` still ships an empty entry (pre–export-expansion). Workspace / `main` Unreleased builds export the symbols listed above. Consumers that depend on `^0.4.0` (including `@opentelemetry/instrumentation-openai`) resolve correctly inside this monorepo via the workspace link, but **out-of-tree installs need a release that includes these exports** (release-please will typically bump beyond `0.4.0`). Release `genai-util` with the expanded surface **before or together with** any instrumentation that imports those symbols from npm.

## Usage Examples

`TelemetryHandler` is exported for instrumentation integrations. Use its
factory methods (`startTool`, `startInference`, `startEmbedding`) rather than
constructing invocation classes directly. Invocation types are exported for
annotations. GenAI semconv constants (including `ATTR_GEN_AI_TOOL_CALL_ID`)
are re-exported from `semconv`.

```typescript
import {
  TelemetryHandler,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  getErrorType,
} from '@opentelemetry/genai-util';

const handler = new TelemetryHandler({
  instrumentationName: '@opentelemetry/instrumentation-example',
  instrumentationVersion: '1.0.0',
  contentCaptureMode: 'none',
});

// Tool invocation
const toolInvocation = handler.startTool({ toolName: 'lookup' });
try {
  const result = toolInvocation.withContext(() => lookup());
  toolInvocation.setResult(result);
  toolInvocation.stop();
} catch (error) {
  toolInvocation.fail({
    exception: error instanceof Error ? error : undefined,
  });
  throw error;
}

// Inference invocation
const inference = handler.startInference({
  providerName: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  operationName: GEN_AI_OPERATION_NAME_VALUE_CHAT,
  requestModel: 'gpt-4o-mini',
});
try {
  // ... call provider SDK ...
  inference.stop();
} catch (err) {
  inference.fail({ errorType: getErrorType(err), exception: err as Error });
  throw err;
}
```

Callback-based integrations can keep the invocation until the SDK reports
success or failure. Pass its `getContext()` as a child's `parentContext` to
preserve explicit callback parentage without requiring an active context manager.

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
