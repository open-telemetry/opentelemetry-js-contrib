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
