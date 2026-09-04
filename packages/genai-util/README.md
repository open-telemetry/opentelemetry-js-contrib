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

- **Semantic Conventions**: Complete constants and enumerations for OpenTelemetry GenAI semantic conventions (attributes, operation names, providers, finish reasons, token types, metrics, events).
- **TelemetryHandler**: Central lifecycle façade managing spans, metrics, events, and completion hooks for LLM and GenAI operations.
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
- **Metrics Helpers**: Pre-configured histograms with standard explicit bucket boundaries:
  - `gen_ai.client.operation.duration` (in seconds)
  - `gen_ai.client.token.usage` (input & output tokens)
  - `gen_ai.client.operation.time_to_first_chunk` (in seconds)
- **Content Capturing & Privacy**: Flexible message content capturing modes (`none`, `span_only`) configurable in code or via environment variables.
- **Completion Hooks**: Pluggable lifecycle hooks (`CompletionHookManager`) for custom logging, evaluations, or forwarding prompts and completions to external analysis services.

---

## Usage Examples

These will be added soon.

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
