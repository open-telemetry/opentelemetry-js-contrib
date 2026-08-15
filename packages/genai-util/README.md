# OpenTelemetry GenAI Utilities

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This package provides shared utilities, data models, lifecycle handlers, and semantic convention constants for Generative AI (GenAI) instrumentation packages in OpenTelemetry JavaScript.

It is the TypeScript / JavaScript equivalent of [`opentelemetry-util-genai`](https://github.com/open-telemetry/opentelemetry-python-genai/tree/main/util/opentelemetry-util-genai) in Python.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/genai-util
```

## Features

- **Semantic Conventions**: Complete constants and enumerations for OpenTelemetry GenAI semantic conventions (attributes, operations, providers, finish reasons, metrics, events).
- **TelemetryHandler**: Central lifecycle façade managing spans, metrics, events, and completion hooks for LLM operations.
- **Invocations**: Invocation lifecycle management for `InferenceInvocation`, `EmbeddingInvocation`, `ToolInvocation`, `AgentInvocation` (local & remote), `WorkflowInvocation`, `RetrievalInvocation`, and `FetchResponseInvocation`.
- **Metrics Helpers**: Pre-configured histograms with standard bucket boundaries for operation duration and token usage.
- **Content Capturing**: Flexible message content capturing modes (`none`, `span_only`, `event_only`, `span_and_event`) configured via code or `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`.
- **Completion Hooks**: Pluggable hooks for logging, evaluation, or uploading prompt/completion content to external backends.

## Usage

### Using TelemetryHandler

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
  // Call the LLM SDK...
  const response = await callLlm();

  // Record outputs and usage
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

  // Complete span and record metrics
  invocation.stop();
} catch (err) {
  invocation.fail(err);
  throw err;
}
```

### Metrics Helpers

```ts
import { metrics } from '@opentelemetry/api';
import {
  createDurationHistogram,
  createTokenUsageHistogram,
  recordOperationDuration,
  recordTokenUsage,
} from '@opentelemetry/genai-util';

const meter = metrics.getMeter('my-genai-instrumentation');
const durationHistogram = createDurationHistogram(meter);
const tokenUsageHistogram = createTokenUsageHistogram(meter);

recordOperationDuration(durationHistogram, 0.42, {
  'gen_ai.provider.name': 'anthropic',
  'gen_ai.request.model': 'claude-3-5-sonnet-20241022',
});

recordTokenUsage(tokenUsageHistogram, { inputTokens: 50, outputTokens: 120 }, {
  'gen_ai.provider.name': 'anthropic',
  'gen_ai.request.model': 'claude-3-5-sonnet-20241022',
});
```

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
