# OpenTelemetry knex Instrumentation for Node.js

[![Gitter chat][gitter-image]][gitter-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for [`knex`](https://github.com/knex/node-knex) and allows the user to automatically collect trace data and export them to their backend of choice.

For automatic instrumentation see the
[@opentelemetry/node](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-node) package.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-knex
```
### Supported Versions
 - `>=1.0.0`

## Usage

```js
const { KnexInstrumentation } = require('@opentelemetry/instrumentation-knex');
const { ConsoleSpanExporter, SimpleSpanProcessor } = require('@opentelemetry/tracing');
const { NodeTracerProvider } = require('@opentelemetry/node');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();

provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

registerInstrumentations({
  instrumentations: [new KnexInstrumentation()],
  tracerProvider: provider,
});
```

See [examples/knex](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/examples/knex) for a short example.

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
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/status.svg?path=packages/opentelemetry-instrumentation-knex
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-knex
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib/dev-status.svg?path=packages/opentelemetry-instrumentation-knex
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fopentelemetry-instrumentation-knex&type=dev
