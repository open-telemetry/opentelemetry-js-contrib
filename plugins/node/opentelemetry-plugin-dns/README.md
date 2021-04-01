# OpenTelemetry DNS Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`dns`](http://nodejs.org/dist/latest/docs/api/dns.html).

For automatic instrumentation see the
[@opentelemetry/node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/plugin-dns
```

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    {
      plugins: {
        dns: {
          enabled: true,
          // You may use a package name or absolute path to the file.
          path: '@opentelemetry/plugin-dns',
          // dns plugin options
        }
      }
    },
  ],
  tracerProvider: provider,
});

```

### Zipkin

If you use Zipkin, you must use `ignoreHostnames` in order to not trace those calls. If the server is local. You can set :

```js
const provider = new NodeTracerProvider();
provider.register();
registerInstrumentations({
  instrumentations: [
    {
      plugins: {
        dns: {
          enabled: true,
          // You may use a package name or absolute path to the file.
          path: '@opentelemetry/plugin-dns',
          ignoreHostnames: ['localhost']
        }
      }
    },
  ],
  tracerProvider: provider,
});

```

### Dns Plugin Options

Dns plugin has currently one option. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| [`ignoreHostnames`](https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-plugin-dns/src/types.ts#L98) | `IgnoreMatcher[]` | Dns plugin will not trace all requests that match hostnames |

## Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-plugin-dns
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-plugin-dns
[devDependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-plugin-dns&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-plugin-dns&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/plugin-dns
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fplugin-dns.svg
