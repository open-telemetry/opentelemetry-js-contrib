# OpenTelemetry Memcached Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`memcached@>=2.2.0`][repo-url].

For automatic instrumentation see the
[@opentelemetry/sdk-trace-node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-memcached
```

### Supported Versions

- `>=2.2`

## Usage

OpenTelemetry Memcached Instrumentation allows the user to automatically collect trace data and export them to the backend of choice, to give observability to distributed systems when working with [memcached][pkg-url].

To load a specific instrumentation (**memcached** in this case), specify it in the registerInstrumentations' configuration

```javascript
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { MemcachedInstrumentation } = require('@opentelemetry/instrumentation-memcached');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new MemcachedInstrumentation({
      enhancedDatabaseReporting: false,
    }),
  ],
});
```

### Configuration Options

| Option | Type | Example | Description |
| ------- | ---- | ------- | ----------- |
| `enhancedDatabaseReporting` | `boolean` | `false` | Include full command statement in the span - **leaks potentially sensitive information to your spans**. Defaults to `false`. |

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-memcached
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-memcached.svg
[repo-url]: https://github.com/3rd-Eden/memcached
[pkg-url]: https://www.npmjs.com/package/memcached
