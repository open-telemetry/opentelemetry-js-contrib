# OpenTelemetry DNS Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`dns`](http://nodejs.org/dist/latest/docs/api/dns.html).

For automatic instrumentation see the
[@opentelemetry/sdk-trace-node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-dns
```

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { DnsInstrumentation } = require('@opentelemetry/instrumentation-dns');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new DnsInstrumentation({
      // see under for available configuration
    }),
  ],
});
```

### Dns Instrumentation Options

Dns instrumentation has currently one option. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| [`ignoreHostnames`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-dns/src/types.ts#L99) | `IgnoreMatcher[]` | Dns instrumentation will not trace all requests that match hostnames |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-dns
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-dns.svg
