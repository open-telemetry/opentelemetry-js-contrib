# OpenTelemetry instrumentation for bunyan

[![NPM Published Version][npm-img]][npm-url]
[![Apache License][license-image]][license-image]

This module provides automatic instrumentation for the injection of trace context to [`bunyan`](https://www.npmjs.com/package/bunyan), which may be loaded using the [`@opentelemetry/sdk-trace-node`](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-sdk-trace-node) package and is included in the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle.

If total installation size is not constrained, it is recommended to use the [`@opentelemetry/auto-instrumentations-node`](https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node) bundle with [@opentelemetry/sdk-node](`https://www.npmjs.com/package/@opentelemetry/sdk-node`) for the most seamless instrumentation experience.

Compatible with OpenTelemetry JS API and SDK `1.0+`.

## Installation

```bash
npm install --save @opentelemetry/instrumentation-bunyan
```

### Supported Versions

- `^1.0.0`

## Usage

```js
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { BunyanInstrumentation } = require('@opentelemetry/instrumentation-bunyan');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');

const provider = new NodeTracerProvider();
provider.register();

registerInstrumentations({
  instrumentations: [
    new BunyanInstrumentation({
      // Optional hook to insert additional context to bunyan records.
      // Called after trace context is added to the record.
      logHook: (span, record) => {
        record['resource.service.name'] = provider.resource.attributes['service.name'];
      },
    }),
    // other instrumentations
  ],
});

bunyan.createLogger({ name: 'example' }).info('foo');
// {"name":"example","msg":"foo","trace_id":"e21c7a95fff34e04f77c7bd518779621","span_id":"b7589a981fde09f4","trace_flags":"01", ...}
```

### Fields added to bunyan records

For the current active span, the following will be added to the bunyan record:

- `trace_id`
- `span_id`
- `trace_flags`

When no span context is active or the span context is invalid, injection is skipped.

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>
- For help or feedback on this project, join us in [GitHub Discussions][discussions-url]

## License

Apache 2.0 - See [LICENSE][license-url] for more information.

[discussions-url]: https://github.com/open-telemetry/opentelemetry-js/discussions
[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[npm-url]: https://www.npmjs.com/package/@opentelemetry/instrumentation-bunyan
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Finstrumentation-bunyan.svg
