# OpenTelemetry BeeAI Framework Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`beeai-framework`](https://github.com/i-am-bee/beeai-framework) library, emitting spans and metrics conforming to the [OpenTelemetry Generative AI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/).

## Installation

```bash
npm install --save @opentelemetry/instrumentation-beeai
```

## Supported Versions

- [`beeai-framework`](https://www.npmjs.com/package/beeai-framework) versions `>=0.1.9 <0.1.14`

## Usage

OpenTelemetry BeeAI Instrumentation allows the user to automatically collect trace and metric telemetry from `BaseAgent` (`ReActAgent`, `ToolCallingAgent`), `ChatModel`, `EmbeddingModel`, and `Tool` executions.

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { BeeAIInstrumentation } from '@opentelemetry/instrumentation-beeai';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [
    new BeeAIInstrumentation({
      // Set to 'span_only' to capture prompt, completion, and tool call contents on spans.
      // Defaults to 'none'.
      captureMessageContent: 'none',
    }),
  ],
});

sdk.start();
```

### Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `captureMessageContent` | `'none' \| 'span_only'` | `'none'` | Controls whether message contents, system instructions, tool arguments, and tool results are recorded on span attributes. Can also be configured via the `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` environment variable. |

### Manual Instrumentation

For automatic patching, register `BeeAIInstrumentation` before importing `beeai-framework` (in ESM applications, also configure the OpenTelemetry instrumentation loader). In bundled or ESM environments where automatic module hooks are not used, call `manuallyInstrument` directly:

```typescript
import * as bee from 'beeai-framework';
import { BeeAIInstrumentation } from '@opentelemetry/instrumentation-beeai';

const instrumentation = new BeeAIInstrumentation();
instrumentation.manuallyInstrument(bee);
```

## Boundary Behavior and Limitations

- **LangChain adapters (`LangChainChatModel`, `LangChainEmbeddingModel`, `LangChainTool`)**: BeeAI skips emitting duplicate spans and metrics for LangChain delegation wrappers so downstream instrumentations (such as `@opentelemetry/instrumentation-langchain` or provider-specific instrumentations) own those calls. Active OpenTelemetry context is still propagated into delegated calls, and direct calls within an enclosing BeeAI agent still increment `gen_ai.invoke_agent.inference_calls` and `gen_ai.invoke_agent.tool_calls`.
- **Experimental `RemoteAgent`**: `beeai-framework/agents/experimental/remote/agent` invokes out-of-process ACP agents over HTTP rather than executing in-process. `RemoteAgent` opts out of `INTERNAL` local-agent spans and metrics while preserving caller OpenTelemetry context for downstream HTTP instrumentation and isolating it from any outer BeeAI agent scope.
- **Internal `final_answer` tool**: BeeAI's internal `final_answer` control-flow tool used by `ToolCallingAgent` is excluded from `execute_tool` spans and agent tool-call counts.
- **Tool-internal calls**: `ChatModel` and nested `Tool` calls invoked inside a tool handler (such as `LLMTool` or custom helper tools) emit their own spans parented to the executing tool span, and their token usage and call counts are not rolled up into the enclosing agent.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-beeai
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-beeai.svg
