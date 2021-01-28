# OpenTelemetry DNS Instrumentation for Node.js

[![Gitter chat][gitter-image]][gitter-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`dns`](http://nodejs.org/dist/latest/docs/api/dns.html).

For automatic instrumentation see the
[@opentelemetry/node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-dns
```

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { DnsInstrumentation } = require('@opentelemetry/instrumentation-dns');

const provider = new NodeTracerProvider({
  // be sure to disable old plugin
  plugins: {
    dns: { enabled: false, path: '@opentelemetry/plugin-dns' }
  }
});

const dnsInstrumentation = new DnsInstrumentation({
  // see under for available configuration
});
```

### Dns Instrumentation Options

Dns instrumentation has currently one option. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| [`ignoreHostnames`](https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/packages/opentelemetry-instrumentation-dns/src/types.ts#L99) | `IgnoreMatcher[]` | Dns instrumentation will not trace all requests that match hostnames |

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
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/status.svg?path=packages/opentelemetry-instrumentation-dns
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-dns
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/dev-status.svg?path=packages/opentelemetry-instrumentation-dns
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-dns&type=dev
