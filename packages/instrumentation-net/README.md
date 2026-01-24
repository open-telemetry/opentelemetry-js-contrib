# OpenTelemetry Net module Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the [`net`](http://nodejs.org/dist/latest/docs/api/net.html) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

Supports both TCP and IPC connections.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-net
```

## Supported Versions

- Node.js `>=14`

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { NetInstrumentation } = require('@opentelemetry/instrumentation-net');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new NetInstrumentation(),
    // other instrumentations
  ],
});
```

## Semantic Conventions

This instrumentation implements Semantic Conventions (semconv) v1.7.0. Since then, many networking-related semantic conventions (in semconv v1.21.0 and v1.23.1) were stabilized. As of `@opentelemetry/instrumentation-net@0.53.0` support has been added for migrating to the stable semantic conventions using the `OTEL_SEMCONV_STABILITY_OPT_IN` environment variable as follows:

1. Upgrade to the latest version of this instrumentation package.
2. Set `OTEL_SEMCONV_STABILITY_OPT_IN=http/dup` to emit both old and stable semantic conventions. (The [`http` token is used to control the `net.*` attributes](https://github.com/open-telemetry/opentelemetry-js/issues/5663#issuecomment-3349204546).)
3. Modify alerts, dashboards, metrics, and other processes in your Observability system to use the stable semantic conventions.
4. Set `OTEL_SEMCONV_STABILITY_OPT_IN=http` to emit only the stable semantic conventions.

By default, if `OTEL_SEMCONV_STABILITY_OPT_IN` is not set or does not include `http`, then the old v1.7.0 semconv is used.
The intent is to provide an approximate 6 month time window for users of this instrumentation to migrate to the new networking semconv, after which a new minor version will use the new semconv by default and drop support for the old semconv.
See [the HTTP migration guide](https://opentelemetry.io/docs/specs/semconv/non-normative/http-migration/) and [deprecated network attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/network/#deprecated-network-attributes) for details.

Attributes collected:

| Old semconv     | Stable semconv          | Description                                                                       |
| --------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `net.transport` | `network.transport`     | One of `pipe`, `unix`, `ip_tcp` (old) or `tcp` (stable)                           |
| `net.peer.name` | `server.address`        | Host name or the IPC file path                                                    |
| `net.peer.port` | `server.port`           | Remote port number                                                                |
| `net.peer.ip`   | `network.peer.address`  | Peer address of the network connection - IP address or Unix domain socket name.   |
| `net.host.ip`   | `network.local.address` | Local address of the network connection - IP address or Unix domain socket name.  |
| `net.host.port` | `network.local.port`    | Local port number of the network connection.                                      |


## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-net
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-net.svg
