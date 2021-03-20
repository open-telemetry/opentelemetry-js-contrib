# OpenTelemetry Net module Instrumentation for Node.js

[![Gitter chat][gitter-image]][gitter-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides instrumentation of outgoing connections for [`net`](http://nodejs.org/dist/latest/docs/api/net.html).
Supports both TCP and IPC connections.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-net
```

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { NetInstrumentation } = require('@opentelemetry/instrumentation-net');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new NetInstrumentation(),
    // other instrumentations
  ],
  tracerProvider: provider,
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

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/open-telemetry/opentelemetry-js-contrib.svg
[gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/status.svg?path=packages/opentelemetry-instrumentation-net
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-net
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/dev-status.svg?path=packages/opentelemetry-instrumentation-net
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-net&type=dev
