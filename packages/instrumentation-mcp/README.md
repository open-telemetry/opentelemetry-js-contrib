# OpenTelemetry MCP Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) SDK for Node.js applications.

## Installation

```bash
npm install @opentelemetry/instrumentation-mcp
```

## Supported Versions

- [MCP SDK](https://www.npmjs.com/package/@modelcontextprotocol/sdk): `^1.11.0`

## Usage

```javascript
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { McpInstrumentation } = require('@opentelemetry/instrumentation-mcp');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new McpInstrumentation(),
  ],
});
```

## Configuration



### Debug Logging

For troubleshooting instrumentation issues, you can enable debug logging to a file:

#### Option 1: Configuration (when manually instantiating)

```javascript
registerInstrumentations({
  instrumentations: [
    new McpInstrumentation({
      debugLogFile: '/tmp/mcp-instrumentation-debug.log'
    }),
  ],
});
```

#### Option 2: Environment Variable (works with auto-instrumentations)

```bash
export OTEL_INSTRUMENTATION_MCP_DEBUG_LOG_FILE=/tmp/mcp-instrumentation-debug.log
node --require @opentelemetry/auto-instrumentations-node/register your-app.js
```

When enabled, the instrumentation will log:

- Module loading and patching events
- Hook creation and invocation
- Any errors during instrumentation setup

This is useful for diagnosing issues with the instrumentation not capturing spans or context propagation problems.

## Context Propagation

This instrumentation automatically propagates trace context between MCP clients and servers:

1. **Client** injects trace context into `request.params._meta`
2. **Server** extracts trace context from `request.params._meta`
3. Server spans become children of client spans, creating distributed traces

This works across process boundaries with stdio, SSE, and other MCP transports.

## Semantic Conventions

This instrumentation uses MCP-specific semantic conventions:

| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `mcp.method.name` | string | MCP method name | `tools/call` |
| `mcp.request.id` | string/number | MCP request ID | `123` |
| `mcp.tool.name` | string | Tool name | `add` |
| `mcp.request.argument.*` | string | Tool arguments (individual) | `mcp.request.argument.a: "1"` |
| `mcp.prompt.name` | string | Prompt name | `review-code` |
| `mcp.resource.uri` | string | Resource URI | `file://example.txt` |

## Compatibility

### CommonJS

✅ **Fully supported** - Works with zero-code auto-instrumentation using `--require`

```bash
node --require @opentelemetry/auto-instrumentations-node/register app.js
```

### ESM (ECMAScript Modules)

❌ **Not supported** - This instrumentation does not work with ESM applications.



## Examples

See the [examples directory](./examples) for complete working examples:

- [simple-client-server](./examples/simple-client-server) - Basic stdio transport example
- [http-client-server](./examples/http-client-server) - HTTP/SSE transport example

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-mcp
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-mcp.svg
