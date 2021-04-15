# OpenTelemetry ioredis Instrumentation for Node.js

[![NPM Published Version][npm-img]][npm-url]
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

To load a specific instrumentation (**ioredis** in this case), specify it in the registerInstrumentations's configuration

```javascript
const { NodeTracerProvider } = require('@opentelemetry/node');
const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new IORedisInstrumentation({
      // see under for available configuration
    })
  ],
  tracerProvider: provider,
})
```

### IORedis Instrumentation Options

IORedis instrumentation has few options available to choose from. You can set the following:

| Options | Type | Description |
| ------- | ---- | ----------- |
| `dbStatementSerializer` | `DbStatementSerializer` | IORedis instrumentation will serialize db.statement using the specified function. |
| `responseHook` | `RedisResponseCustomAttributeFunction` | Function for adding custom attributes on db response |
| `requireParentSpan` | `boolean` | Require parent to create ioredis span, default when unset is true |

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
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-ioredis
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-ioredis
[devdependencies-image]: https://status.david-dm.org/gh/open-telemetry/opentelemetry-js-contrib.svg?path=plugins%2Fnode%2Fopentelemetry-instrumentation-ioredis&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=plugins%2Fnode%2Fopentelemetry-instrumentation-ioredis&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-ioredis
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-ioredis.svg
