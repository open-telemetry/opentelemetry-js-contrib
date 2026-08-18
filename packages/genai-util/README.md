# OpenTelemetry GenAI Utilities

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

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
  - Records **Time To First Token (TTFT)** (`gen_ai.server.time_to_first_token`) and sets `gen_ai.request.stream = true` on the first chunk.
  - Supports per-chunk callbacks (`onChunk`), completion hooks (`onEnd`), error handling (`onError`), and early iterator break (`return()`).
  - Automatically finalizes spans and computes overall duration metrics.
- **Metrics Helpers**: Pre-configured histograms with standard explicit bucket boundaries:
  - `gen_ai.client.operation.duration` (in seconds)
  - `gen_ai.client.token.usage` (input & output tokens)
  - `gen_ai.server.time_to_first_token` (in seconds)
- **Content Capturing & Privacy**: Flexible message content capturing modes (`none`, `span_only`, `event_only`, `span_and_event`) configurable in code or via environment variables.
- **Completion Hooks**: Pluggable lifecycle hooks (`CompletionHookManager`) for custom logging, evaluations, or forwarding prompts and completions to external analysis services.

---

## Usage Examples

### 1. Basic LLM Inference (Chat / Completion)

```ts
import { trace, metrics } from '@opentelemetry/api';
import { TelemetryHandler } from '@opentelemetry/genai-util';

const tracer = trace.getTracer('my-genai-instrumentation');
const meter = metrics.getMeter('my-genai-instrumentation');

const handler = new TelemetryHandler({
  tracer,
  meter,
});

// Start an inference invocation
const invocation = handler.startInference({
  providerName: 'openai',
  operationName: 'chat',
  requestModel: 'gpt-4o',
  requestOptions: {
    temperature: 0.7,
    maxTokens: 1000,
  },
  inputMessages: [
    {
      role: 'user',
      parts: [{ type: 'text', content: 'What is OpenTelemetry?' }],
    },
  ],
});

try {
  // Call LLM SDK...
  const response = await callLlm();

  // Record response details, finish reasons, and token usage
  invocation.setResponseModel(response.model);
  invocation.setResponseId(response.id);
  invocation.setFinishReasons(['stop']);
  invocation.setUsage({
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
    totalTokens: response.usage.total_tokens,
  });
  invocation.addOutputMessages([
    {
      role: 'assistant',
      parts: [{ type: 'text', content: response.content }],
      finish_reason: 'stop',
    },
  ]);

  // Complete span and record duration metrics
  invocation.stop();
} catch (err) {
  invocation.fail(err);
  throw err;
}
```

---

### 2. Wrapping Streaming Responses

For streaming requests (`stream: true`), use `wrapAsyncStream` (or `handler.wrapAsyncStream`) to automatically record Time To First Token (TTFT), manage span lifecycle, and process chunks:

```ts
const invocation = handler.startInference({
  providerName: 'openai',
  operationName: 'chat',
  requestModel: 'gpt-4o',
});

const rawStream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Tell me a story' }],
  stream: true,
});

// Wrap the async iterable stream with telemetry
const wrappedStream = handler.wrapAsyncStream(rawStream, {
  invocation,
  onChunk: chunk => {
    // Optionally accumulate text deltas, usage, or finish reasons
  },
  onEnd: () => {
    // Optionally set accumulated output messages or usage before span stops
  },
});

// The wrapped stream transparently proxies methods and implements AsyncIterable
for await (const chunk of wrappedStream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
// Span automatically ends with OK status, and TTFT and duration metrics are recorded!
```

---

### 3. Agent Invocations (Local & Remote)

The library provides dedicated support for Agent / Assistant spans:

```ts
// Local in-process agent (SpanKind.INTERNAL)
const localAgent = handler.startLocalAgent({
  agentId: 'research-agent-01',
  agentName: 'Research Assistant',
  agentDescription: 'Assists with technical literature search',
  agentVersion: '1.0.0',
  conversationId: 'conv-12345',
});

// ... perform agent actions ...
localAgent.stop();

// Remote agent service (SpanKind.CLIENT)
const remoteAgent = handler.startRemoteAgent({
  agentId: 'agent-remote-service',
  agentName: 'Customer Support Agent',
  serverAddress: 'agent.example.com',
  serverPort: 443,
  providerName: 'custom-platform',
  requestModel: 'support-agent-v2',
});

// Remote agent tracks client metrics, duration, and server attributes
remoteAgent.setFinishReasons(['stop']);
remoteAgent.stop();
```

---

### 4. Tool Execution Spans

```ts
const toolInvocation = handler.startTool({
  toolName: 'web_search',
  toolType: 'function',
  toolDescription: 'Searches the web for latest info',
  toolCallId: 'call_abc123',
});

try {
  const result = await executeTool({ query: 'OpenTelemetry news' });
  toolInvocation.setResult(result);
  toolInvocation.stop();
} catch (err) {
  toolInvocation.fail(err);
  throw err;
}
```

---

### 5. Retrieval (RAG / Vector Lookups)

```ts
const retrieval = handler.startRetrieval({
  dataSourceId: 'vector-db-docs',
  queryText: 'How to instrument GenAI in Node.js?',
  serverAddress: 'vector-db.internal',
  serverPort: 8000,
});

retrieval.setDocuments([
  {
    documentId: 'doc-42',
    content: 'OpenTelemetry GenAI utilities provide standard telemetry...',
    score: 0.94,
  },
]);

retrieval.stop();
```

---

### 6. Completion Hooks

You can register custom hooks to inspect prompt and completion results, calculate custom evaluations, or forward data to external logging backends:

```ts
handler.addCompletionHook({
  async onCompletion(result) {
    console.log(`Invocation finished for operation: ${result.operationName}`);
    console.log(`Input messages count: ${result.inputMessages?.length}`);
    console.log(`Token usage:`, result.usage);
    if (result.error) {
      console.error(`Operation failed:`, result.error);
    }
  },
});
```

---

### 7. Standalone Metrics Helpers

```ts
import { metrics } from '@opentelemetry/api';
import {
  createDurationHistogram,
  createTokenUsageHistogram,
  createServerTimeToFirstTokenHistogram,
  recordOperationDuration,
  recordTokenUsage,
  recordServerTimeToFirstToken,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
} from '@opentelemetry/genai-util';

const meter = metrics.getMeter('my-genai-instrumentation');
const durationHist = createDurationHistogram(meter);
const tokenUsageHist = createTokenUsageHistogram(meter);
const ttftHist = createServerTimeToFirstTokenHistogram(meter);

recordOperationDuration(durationHist, 0.42, {
  [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  [ATTR_GEN_AI_REQUEST_MODEL]: 'claude-3-5-sonnet-20241022',
});

recordTokenUsage(tokenUsageHist, { inputTokens: 50, outputTokens: 120 }, {
  [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC,
  [ATTR_GEN_AI_REQUEST_MODEL]: 'claude-3-5-sonnet-20241022',
});

recordServerTimeToFirstToken(ttftHist, 0.15, {
  [ATTR_GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_NAME_VALUE_OPENAI,
  [ATTR_GEN_AI_REQUEST_MODEL]: 'gpt-4o',
});
```

---

## Environment Variables

| Variable | Values | Description |
| :--- | :--- | :--- |
| `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` | `none`, `span_only`, `event_only`, `span_and_event`, `true`, `false` | Controls whether prompt instructions and completion messages are captured as span attributes and/or events. Defaults to `none`. |
| `OTEL_INSTRUMENTATION_GENAI_EMIT_EVENT` | `true`, `false`, `1`, `0` | Controls whether detailed GenAI events (such as message events) are emitted. |
| `OTEL_INSTRUMENTATION_GENAI_COMPLETION_HOOK` | `<module-path>` | Optional module path for dynamically loading custom completion hooks. |

---

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
