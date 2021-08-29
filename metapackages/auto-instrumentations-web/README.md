# OpenTelemetry Meta Packages for Web

[![NPM Published Version][npm-img]][npm-url]
[![dependencies][dependencies-image]][dependencies-url]
[![devDependencies][devDependencies-image]][devDependencies-url]
[![Apache License][license-image]][license-url]

## Installation

```bash
npm install --save @opentelemetry/auto-instrumentations-web
```

## Usage

```javascript
const { WebTracerProvider } = require('@opentelemetry/sdk-trace-web');
const { getWebAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-web');
const { CollectorTraceExporter } = require('@opentelemetry/exporter-collector');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { ZoneContextManager } = require('@opentelemetry/context-zone');
const { B3Propagator } = require('@opentelemetry/propagator-b3');

const exporter = new CollectorTraceExporter({
  serviceName: 'auto-instrumentations-web',
});

const provider = new WebTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register({
  contextManager: new ZoneContextManager(),
  propagator: new B3Propagator(),
});

registerInstrumentations({
  instrumentations: [
    getWebAutoInstrumentations({
      // load custom configuration for xml-http-request instrumentation
      '@opentelemetry/instrumentation-xml-http-request': {
        clearTimingResources: true,
      },
    }),
  ],
});

```

## Useful links

- For more information on OpenTelemetry, visit: <https://opentelemetry.io/>
- For more about OpenTelemetry JavaScript: <https://github.com/open-telemetry/opentelemetry-js>

## License

APACHE 2.0 - See [LICENSE][license-url] for more information.

[license-url]: https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/LICENSE
[license-image]: https://img.shields.io/badge/license-Apache_2.0-green.svg?style=flat
[dependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib.svg?path=packages%2Fauto-instrumentations-web
[dependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fauto-instrumentations-web
[devDependencies-image]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib.svg?path=packages%2Fauto-instrumentations-web&type=dev
[devDependencies-url]: https://david-dm.org/open-telemetry/opentelemetry-js-contrib?path=packages%2Fauto-instrumentations-web&type=dev
[npm-url]: https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-web
[npm-img]: https://badge.fury.io/js/%40opentelemetry%2Fauto-instrumentations-web.svg
