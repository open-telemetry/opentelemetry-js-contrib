# OpenTelemetry OpenAI Agents Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic OpenTelemetry instrumentation for the
[`@openai/agents`](https://www.npmjs.com/package/@openai/agents) JavaScript SDK.
It uses the SDK's tracing processor callbacks to emit GenAI workflow, agent,
and function-tool spans.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-openai-agents
```

## Supported Versions

- [`@openai/agents`](https://www.npmjs.com/package/@openai/agents) versions `>=0.14.0 <1`

## Usage

Register the instrumentation before loading `@openai/agents`:

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const {
  OpenAIAgentsInstrumentation,
} = require('@opentelemetry/instrumentation-openai-agents');

const sdk = new NodeSDK({
  instrumentations: [new OpenAIAgentsInstrumentation()],
});
sdk.start();

process.once('beforeExit', async () => {
  await sdk.shutdown();
});
```

The instrumentation is also enabled by default when using
[`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node).

### Options

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `captureMessageContent` | `boolean` | `false` | Capture function tool arguments and results. This may expose sensitive data. The `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` environment variable can also set this option. |
| `disableOpenAITraceExport` | `boolean` | `false` | Replace the Agents SDK trace processors with the OpenTelemetry processor, disabling its native OpenAI trace export. By default both processors run. |

The OpenAI client instrumentation remains responsible for model-call spans.
This package emits the agent orchestration spans and preserves the SDK's task
and turn spans as hierarchy-only callbacks, avoiding duplicate LLM spans.

The JavaScript tracing callbacks are lifecycle notifications; they do not keep
an OpenTelemetry context active between start and end. This instrumentation
therefore constructs the workflow, agent, and tool hierarchy explicitly, but
model-call spans from separate client instrumentation are not guaranteed to be
children of the agent span. Guaranteeing that relationship would require an
additional runner-boundary context hook.

## Spans

| Agents SDK callback | OpenTelemetry span | `gen_ai.operation.name` |
| ------------------- | ------------------ | ----------------------- |
| Trace | `invoke_workflow <name>` | `invoke_workflow` |
| Agent span | `invoke_agent <name>` | `invoke_agent` |
| Function span | `execute_tool <name>` | `execute_tool` |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-openai-agents
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-openai-agents.svg
