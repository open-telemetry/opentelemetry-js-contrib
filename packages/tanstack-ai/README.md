# OpenTelemetry TanStack AI Middleware for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides OpenTelemetry middleware for [`@tanstack/ai`](https://www.npmjs.com/package/@tanstack/ai).

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/tanstack-ai
```

## Supported Versions

- [`@tanstack/ai`](https://www.npmjs.com/package/@tanstack/ai) versions `>=0.10.0 <2.0.0`

## Usage

```js
import { chat } from '@tanstack/ai';
import { openTelemetryMiddleware } from '@opentelemetry/tanstack-ai';

const result = await chat({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello!' }],
  middleware: [openTelemetryMiddleware()],
});
```

### Semantic Conventions

This middleware emits spans conforming to the OpenTelemetry Generative AI semantic conventions:

- **Agent / Chat**: Root span named `invoke_agent` with `gen_ai.operation.name: 'invoke_agent'`.
- **Model Turn / LLM**: Child span named `chat {model}` with `gen_ai.operation.name: 'chat'`, `gen_ai.provider.name`, `gen_ai.request.model`, token counts, and input/output messages.
- **Tool Execution**: Child span named `execute_tool {tool_name}` with `gen_ai.operation.name: 'execute_tool'`, tool arguments, and results.

### Context Propagation and Nested Spans

This package instruments the TanStack AI middleware lifecycle and propagates the active OpenTelemetry context across both model invocations and tool executions:

- **Provider SDK Instrumentations**: When using `@tanstack/ai` 1.x, this middleware provides `wrapFetch` from `onConfig` so downstream network calls (such as OpenAI or Anthropic fetch calls) execute inside the active `chat {model}` invocation context. In most setups, you should rely on `@opentelemetry/tanstack-ai` as the primary instrumentation for TanStack AI applications.
- **Tool Body Executions**: When server-side tools are invoked, this middleware wraps the tool's `execute` function to run inside the active `execute_tool {tool_name}` context. Any child spans created inside the tool body (such as database queries, HTTP client requests, or child operations) automatically nest under the corresponding `execute_tool` span rather than becoming sibling spans under the caller's context.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/tanstack-ai
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Ftanstack-ai.svg
