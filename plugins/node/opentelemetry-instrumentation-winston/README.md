# OpenTelemetry instrumentation for winston

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for injection of trace context for the [`winston`](https://www.npmjs.com/package/winston) module, which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-winston
```

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { WinstonInstrumentation } = require('@opentelemetry/instrumentation-winston');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new WinstonInstrumentation({
      // Optional hook to insert additional context to log metadata.
      // Called after trace context is injected to metadata.
      logHook: (span, record) => {
        record['resource.service.name'] = provider.resource.attributes['service.name'];
      },
    }),
    // other instrumentations
  ],
});

const winston = require('winston');
const logger = winston.createLogger({
  transports: [new winston.transports.Console()],
})
logger.info('foobar');
// {"message":"foobar","trace_id":"e21c7a95fff34e04f77c7bd518779621","span_id":"b7589a981fde09f4","trace_flags":"01", ...}
```

### Fields added to Winston metadata

For the current active span, the following fields are injected:

* `trace_id`
* `span_id`
* `trace_flags`

When no span context is active or the span context is invalid, injection is skipped.

### Supported versions

`1.x`, `2.x`, `3.x`

## Useful links

* For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
* For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
* For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-winston
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-winston.svg
