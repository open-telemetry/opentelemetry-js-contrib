# OpenTelemetry redis Instrumentation for Node.js
[![Gitter chat][gitter-image]][gitter-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`redis@^2.6.0`](https://github.com/NodeRedis/node_redis).

For automatic instrumentation see the
[@opentelemetry/node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```
npm install --save @opentelemetry/instrumentation-redis
```

### Supported Versions
 - `>=2.6.0`

## Usage

OpenTelemetry Redis Instrumentation allows the user to automatically collect trace data and export them to the backend of choice, to give observability to distributed systems when working with [redis](https://www.npmjs.com/package/redis).

To load a specific instrumentation (**redis** in this case), specify it in the registerInstrumentations' configuration
```javascript
const { NodeTracerProvider } = require('@opentelemetry/node');
const { RedisInstrumentation } = require('@opentelemetry/instrumentation-redis');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

registerInstrumentations({
  instrumentations: [
    new RedisInstrumentation(),
    {
      // be sure to disable old plugin but only if it was installed
      plugins: {
        redis: { enabled: false, path: '@opentelemetry/plugin-redis' }
      },
    }
  ],
  tracerProvider: provider,
})
```

See [examples/redis](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/redis) for a short example.

## Useful links
- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us on [gitter][gitter-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[gitter-image]: https://badges.gitter.im/open-telemetry/opentelemetry-js.svg
[gitter-url]: https://gitter.im/open-telemetry/opentelemetry-node?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/status.svg?path=packages/opentelemetry-instrumentation-redis
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-redis
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/dev-status.svg?path=packages/opentelemetry-instrumentation-redis
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-redis&type=dev
