# OpenTelemetry socket.io Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`socket.io`](https://github.com/socketio/socket.io) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-socket.io
```

## Supported Versions

- `>=2 <5`

## Usage

To load a specific plugin, specify it in the registerInstrumentations's configuration:

```js
const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
const {
  SocketIoInstrumentation,
} = require("@opentelemetry/instrumentation-socket.io");
const { registerInstrumentations } = require("@opentelemetry/instrumentation");

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [new SocketIoInstrumentation()],
});
```

## Optional Parameters

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `emitHook` | `SocketIoHookFunction` | `undefined` | hook for adding custom attributes before socket.io emits the event |
| `emitIgnoreEventList` | `string[]` | `[]` | names of emitted events to ignore tracing for |
| `onHook` | `SocketIoHookFunction` | `undefined` | hook for adding custom attributes before the event listener (callback) is invoked |
| `onIgnoreEventList` | `string[]` | `[]` | names of listened events to ignore tracing for |
| `traceReserved` | `boolean` | `false` | set to true if you want to trace socket.io reserved events (see [docs](https://socket.io/docs/v4/emit-cheatsheet/#Reserved-events)) |

## Migration From opentelemetry-instrumentation-socket.io

This instrumentation was originally published and maintained under the name `"opentelemetry-instrumentation-socket.io"` in [this repo](https://github.com/aspecto-io/opentelemetry-ext-js).

Few breaking changes were made during porting to the contrib repo:

### filterHttpTransport

The instrumentation's config `filterHttpTransport` option was removed to decouple this instrumentation from the http instrumentation.
if you do not want to trace the socket.io http requests, add the default socket.io route (`/socket.io/`) to the `HttpInstrumentationConfig.ignoreIncomingPaths` array

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-socket.io
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-socket.io.svg
