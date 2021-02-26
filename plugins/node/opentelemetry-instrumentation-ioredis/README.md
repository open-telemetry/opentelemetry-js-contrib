# OpenTelemetry ioredis Instrumentation for Node.js

[![Gitter chat][gitter-image]][gitter-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`ioredis`](https://github.com/luin/ioredis).

For automatic instrumentation see the
[@opentelemetry/node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```sh
npm install --save @opentelemetry/instrumentation-ioredis
```

### Supported Versions

- `>=2.0.0`

## Usage

To load a specific instrumentation (**ioredis** in this case), specify it in the Node Tracer's configuration

```javascript
const { NodeTracerProvider } = require('@opentelemetry/node');
const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');

const provider = new NodeTracerProvider({
  // be sure to disable old plugin
  plugins: {
    ioredis: { enabled: false, path: '@opentelemetry/plugin-ioredis' }
  },
});
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

const ioredisInstrumentation = new IORedisInstrumentation({
  // see under for available configuration
});

```

### IORedis Instrumentation Options

IORedis instrumentation has few options available to choose from. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| `dbStatementSerializer` | `DbStatementSerializer` | IORedis instrumentation will serialize db.statement using the specified function. |
| `responseHook` | `RedisResponseCustomAttributeFunction` | Function for adding custom attributes on db response |

#### Custom db.statement Serializer
The instrumentation serializes the whole command into a Span attribute called `db.statement`. The standard serialization format is `{cmdName} {cmdArgs.join(',')}`.
It is also possible to define a custom serialization function. The function will receive the command name and arguments and must return a string.

Here is a simple example to serialize the command name skipping arguments:

```javascript
const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');

const ioredisInstrumentation = new IORedisInstrumentation({
  dbStatementSerializer: function (cmdName, cmdArgs) {
    return cmdName;
  }
});

```

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
[dependencies-image]: https://david-dm.org/open-telemetryopentelemetry-js-contrib/status.svg?path=packages/opentelemetry-instrumentation-ioredis
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-ioredis
[devDependencies-image]: https://david-dm.org/open-telemetryopentelemetry-js-contrib/dev-status.svg?path=packages/opentelemetry-instrumentation-ioredis
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-ioredis&type=dev
