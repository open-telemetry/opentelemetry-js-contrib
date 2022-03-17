# OpenTelemetry Net module Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides instrumentation of outgoing connections for [`net`](http://nodejs.org/dist/latest/docs/api/net.html).
Supports both TCP and IPC connections.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-net
```

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

### Attributes added to `connect` spans

* `net.transport`: `IP.TCP`, `pipe` or `Unix`
* `net.peer.name`: host name or the IPC file path

For TCP:

* `net.peer.ip`
* `net.peer.port`
* `net.host.ip`
* `net.host.port`

## Useful links

* For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
* For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
* For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-net
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-net.svg
