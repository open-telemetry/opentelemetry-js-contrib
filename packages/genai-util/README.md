# OpenTelemetry GenAI Utilities

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

> [!NOTE]
> This package is under active development, all functionality and features listed here may not be immediately available.

This package provides shared utilities, data models, invocation lifecycle handlers, stream wrappers, and semantic convention constants for Generative AI (GenAI) instrumentation packages in OpenTelemetry JavaScript.

It is the TypeScript / JavaScript equivalent of [`opentelemetry-util-genai`](https://github.com/open-telemetry/opentelemetry-python-genai/tree/main/util/opentelemetry-util-genai) in Python and aligns with the latest [OpenTelemetry GenAI Semantic Conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/README.md).

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
  - `LocalAgentInvocation` / `RemoteAgentInvocation` (`AgentInvocation`): In-process agent, workflow, and framework entrypoint invocations (`invoke_agent`, `invoke_workflow`, `invoke_runner` with `SpanKind.INTERNAL`) and remote hosted agent invocations (`invoke_agent` with `SpanKind.CLIENT`).
  - `EmbeddingInvocation`: Text and multimodal embedding generation (`embeddings`).
  - `ToolInvocation`: Tool / function execution (`execute_tool`).
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
  - `gen_ai.invoke_agent.duration` (in seconds)
  - `gen_ai.invoke_agent.inference_calls` and `gen_ai.invoke_agent.tool_calls` (per-invocation call count histograms)
  - `gen_ai.client.invoke_agent.duration` (in seconds)
- **Content Capturing & Privacy**: Flexible message content capturing modes (`none`, `span_only`) configurable in code or via environment variables.

---

## Usage Examples

`TelemetryHandler` is exported for instrumentation integrations. Use its
`startLocalAgent`, `startRemoteAgent`, and `startTool` factories to create
invocations rather than constructing them directly. `ToolInvocation` and
`ATTR_GEN_AI_TOOL_CALL_ID` are also exported for integrations that need type
annotations or to set the tool-call ID after starting an invocation; additional
invocation and option types are exported incrementally as instrumentations adopt
them.

```typescript
import { TelemetryHandler } from '@opentelemetry/genai-util';

const handler = new TelemetryHandler({
  instrumentationName: '@opentelemetry/instrumentation-example',
  instrumentationVersion: '1.0.0',
  contentCaptureMode: 'none',
});

const agent = handler.startLocalAgent({
  agentName: 'ResearchAgent',
  trackInferenceCalls: true,
  trackToolCalls: true,
});
try {
  await agent.withContext(async () => {
    const tool = handler.startTool({ toolName: 'lookup' });
    try {
      const result = lookup();
      tool.setResult(result);
      tool.stop();
      agent.recordToolCall();
    } catch (error) {
      tool.fail({ exception: error instanceof Error ? error : undefined });
      throw error;
    }
  });
  agent.stop();
} catch (error) {
  agent.fail({ exception: error instanceof Error ? error : undefined });
  throw error;
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
