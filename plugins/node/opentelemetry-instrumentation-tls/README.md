# OpenTelemetry Net module Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides instrumentation of outgoing connections for [`tls`](http://nodejs.org/dist/latest/docs/api/net.html).

## Installation

```bash
npm install --save @opentelemetry/instrumentation-tls
```

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { TLSInstrumentation } = require('@opentelemetry/instrumentation-tls');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new TLSInstrumentation(),
    // other instrumentations
  ],
  tracerProvider: provider,
});
```

### Attributes added to `connect` spans

* `net.tls.servername`: Server name for the SNI TLS extension

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-net
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-net
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-net&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-net&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-net
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-net.svg
