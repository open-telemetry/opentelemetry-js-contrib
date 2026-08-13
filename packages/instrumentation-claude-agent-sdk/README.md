# OpenTelemetry Claude Agent SDK Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for
[`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).
It is migrated from the Apache-2.0 licensed
[OpenInference donation at commit `6cdd644d`](https://github.com/open-telemetry/donation-openinference/tree/6cdd644d79fccf50aedcb614187f924ddfcafb7b/js/packages/openinference-instrumentation-claude-agent-sdk)
and emits official OpenTelemetry GenAI semantic conventions without
OpenInference dependencies.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-claude-agent-sdk
```

## Supported versions

- `@anthropic-ai/claude-agent-sdk` versions `>=0.2.0 <1`

## Supported API

- `query()`

The donated package also wrapped experimental V2 session exports. Those
exports were removed from current Claude Agent SDK releases and are not
included in this migration.

## Telemetry

Each `query()` invocation creates an internal `invoke_agent` span that stays
open until the returned `Query` completes, fails, is closed, or iteration ends
early. The instrumentation records:

- `gen_ai.operation.name`
- `gen_ai.agent.name` and, for configured custom agents,
  `gen_ai.agent.description`
- `gen_ai.request.model`
- `gen_ai.conversation.id`
- `gen_ai.response.finish_reasons`
- input, output, and cache token usage
- `error.type` for SDK result and iterator errors

The instrumentation injects `PreToolUse`, `PostToolUse`, and
`PostToolUseFailure` hooks while preserving user hooks. Tool executions create
internal `execute_tool` child spans with the tool name, type, and call ID.

Message content and tool arguments/results are disabled by default because
they can contain sensitive data.

## Automatic instrumentation

Initialize the instrumentation before loading the Claude Agent SDK:

```js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const {
  ClaudeAgentSDKInstrumentation,
} = require('@opentelemetry/instrumentation-claude-agent-sdk');

const sdk = new NodeSDK({
  instrumentations: [new ClaudeAgentSDKInstrumentation()],
});

sdk.start();
```

## Manual ESM instrumentation

ESM module namespaces are immutable. `manuallyInstrument()` returns an
instrumented module object that must be used for subsequent calls:

```js
import * as ClaudeAgentSDK from '@anthropic-ai/claude-agent-sdk';
import { ClaudeAgentSDKInstrumentation } from '@opentelemetry/instrumentation-claude-agent-sdk';

const instrumentation = new ClaudeAgentSDKInstrumentation();
const instrumentedClaudeAgentSDK =
  instrumentation.manuallyInstrument(ClaudeAgentSDK);

for await (const message of instrumentedClaudeAgentSDK.query({
  prompt: 'Explain OpenTelemetry in one sentence.',
})) {
  console.log(message);
}
```

## Capture message content

Enable content capture through configuration:

```js
new ClaudeAgentSDKInstrumentation({
  captureMessageContent: true,
});
```

Or set:

```text
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true
```

When enabled, the instrumentation records string and streaming prompts,
assistant responses, reasoning, tool calls and results, structured output,
multimodal references, provider-hosted tool activity, visible system
instructions, and tool arguments/results using the GenAI content schemas.

## Conformance

The scenarios under [`test/conformance`](test/conformance) validate
`invoke_agent` and `execute_tool` telemetry with the
[semantic conventions conformance runner](https://github.com/open-telemetry/semantic-conventions-conformance).
Build the package before running them:

```bash
npm run compile:with-dependencies
npm run test:conformance
```

The conformance command requires the runner, GenAI wrapper, and Weaver as
documented by
[`semantic-conventions-conformance`](https://github.com/open-telemetry/semantic-conventions-conformance).

## References

- [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-claude-agent-sdk
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-claude-agent-sdk.svg
